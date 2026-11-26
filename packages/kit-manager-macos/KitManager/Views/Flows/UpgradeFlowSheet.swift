import KitManagerCore
import SwiftUI

/// Reviews one kit destination before applying it to the project on a separate branch.
struct UpgradeFlowSheet: View {
    let project: Project

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openKitDiff) private var openKitDiff

    @State private var phase: UpgradeFlowPhase = .review
    @State private var mainTarget: UpgradeTarget?
    @State private var releases: [UpgradeTarget] = []
    @State private var selectedTag: String?
    @State private var releaseError: String?
    @State private var preview: Loadable<UpgradeReview> = .idle
    @State private var generation = 0
    @State private var selectionRevision = 0
    @State private var branchName: String?
    @State private var backsUp = true
    @State private var showsRiskFiles = false
    @State private var isLoadingTargets = true
    /// Why the last "Switch back" failed; the button stays so it can be retried.
    @State private var rollbackError: PresentedError?
    /// Why "Resolve with Claude" could not open Terminal; the button stays so it can be retried.
    @State private var resolveError: PresentedError?

    private struct PreviewRequest: Equatable {
        let generation: Int
        let selectionRevision: Int
        let target: UpgradeTarget?
    }

    private var snapshot: ProjectSnapshot? { model.snapshots[project.id] }
    private var precondition: UpgradePrecondition { model.upgradePrecondition(project) }
    private var target: UpgradeTarget? {
        guard let selectedTag else { return mainTarget }
        return releases.first { $0.label == selectedTag }
    }

    private var previewRequest: PreviewRequest {
        PreviewRequest(
            generation: generation, selectionRevision: selectionRevision, target: isLoadingTargets ? nil : target)
    }

    private var isBusy: Bool {
        switch phase {
        case .running, .rollingBack: true
        case .review, .finished, .rolledBack: false
        }
    }

    var body: some View {
        let revision = generation
        let request = previewRequest
        VStack(spacing: 0) {
            Form {
                content
            }
            .formStyle(.grouped)
            .disclosureGroupStyle(.row)
            .defaultScrollAnchor(.top, for: .sizeChanges)
            .frame(height: min(formHeight, max(280, (NSScreen.main?.visibleFrame.height ?? 800) - 105)))
            Divider()
            footer.padding(20)
        }
        .frame(width: 540)
        .interactiveDismissDisabled(isBusy)
        .task(id: revision) { await loadTargets(for: revision) }
        .task(id: request) { await loadPreview(request) }
        .onChange(of: model.latestMain) { _, main in
            guard case .review = phase, case .loaded(let review, stale: false) = preview,
                !review.target.isRelease, review.target.commit != main
            else { return }
            preview = .loaded(review, stale: true)
        }
    }

    private var formHeight: CGFloat {
        switch phase {
        case .review:
            if reviewedReport?.riskSummary?.detail != nil { showsRiskFiles ? 730 : 610 }
            else { reviewedReport == nil ? 320 : 460 }
        case .finished(.applied): 380
        case .finished(.launched), .finished(.failed): 240
        case .running, .rollingBack, .rolledBack: 140
        }
    }

    private var review: UpgradeReview? {
        guard case .loaded(let review, stale: false) = preview, !isLoadingTargets,
            review.target == target, review.context.state == snapshot?.kitState,
            review.context.branch == snapshot?.git?.branch, review.context.url == project.url
        else { return nil }
        return review
    }

    private var reviewedReport: TransitionReport? { review?.report }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .review:
            Section {
                versions
                if !releases.isEmpty || selectedTag != nil { releasePicker }
                if let releaseError {
                    Label("Stable releases could not be loaded.", systemImage: "info.circle")
                        .foregroundStyle(.secondary)
                        .help(releaseError)
                }
                preconditionRow
                if branchName != nil || snapshot?.git?.branch != nil {
                    branchDetails(update: branchName, previous: review?.context.branch ?? snapshot?.git?.branch)
                }
            } header: {
                Text("Review upgrade")
                    .accessibilityAddTraits(.isHeader)
            }
            if let review, review.report.upToDate != true {
                Section {
                    TransitionBackupToggle(backsUp: $backsUp, hasUnsaved: (review.report.unsaved?.total ?? 0) > 0)
                }
                Section("Preview (nothing is changed yet)") {
                    let modules = Set(review.context.state.modules)
                    TransitionGroupedCounts(counts: review.report.groupedCounts)
                    ChangeFileList(report: review.report, modules: modules, limit: 6)
                    Text("File diffs show upstream kit changes, not the merged project files.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let openKitDiff {
                        Button("Compare kit changes", systemImage: "doc.text.magnifyingglass") {
                            openKitDiff(DiffRequest(
                                title: "Upstream changes to \(review.target.label)", base: review.report.from,
                                head: review.target.commit, modules: modules))
                        }
                        .buttonStyle(.glass)
                        .help("Compare the installed and target kit commits, not the merged project files")
                    }
                }
            } else {
                Section("Preview (nothing is changed yet)") {
                    previewContent
                }
            }
        case .running:
            Section("Kit Update") {
                progress("Creating a separate branch and applying the update…")
            }
        case .finished(let outcome):
            Section("Kit Update") {
                finished(outcome)
            }
        case .rollingBack:
            Section("Kit Update") {
                progress("Switching back and deleting the update branch…")
            }
        case .rolledBack:
            Section("Kit Update") {
                Label("Back on your previous branch. The update branch is gone.", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(Color.green)
            }
        }
    }

    private var versions: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(ProjectRow(project: project, snapshot: snapshot).name)
                .font(.headline)
            LabeledContent("Installed") {
                version(snapshot?.versionLabel, commit: snapshot?.kitState?.commit)
            }
            LabeledContent("Target") {
                version(target?.label, commit: target?.commit)
            }
        }
    }

    private func version(_ label: String?, commit: String?) -> some View {
        let short = commit.map { String($0.prefix(7)) }
        return HStack(spacing: 6) {
            if let label, label != short { Text(label) }
            Text(short ?? "—").font(.callout.monospaced()).foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    private var releasePicker: some View {
        Picker("Upgrade source", selection: Binding(
            get: { selectedTag },
            set: { tag in
                guard tag != selectedTag else { return }
                resetPreview()
                selectedTag = tag
                selectionRevision += 1
            }
        )) {
            Text("origin/main (default)").tag(Optional<String>.none)
            ForEach(releases, id: \.label) { release in
                Text(release.label).tag(Optional(release.label))
            }
            if let selectedTag, target == nil {
                Text("\(selectedTag) (unavailable)").tag(Optional(selectedTag))
            }
        }
        .disabled(isLoadingTargets)
        .help("Pick a release for this upgrade only. The project will still follow main.")
    }

    private var preconditionRow: some View {
        Group {
            if let blockedReason {
                Label {
                    Text(blockedReason)
                } icon: {
                    Image(systemName: preconditionIndicator.symbol)
                        .foregroundStyle(preconditionIndicator.tone.color)
                }
                .help(preconditionHelp ?? blockedReason)
            } else if model.cliStatus != .ready {
                Label("Build the nuxt-saas CLI first.", systemImage: "xmark.octagon.fill")
                    .foregroundStyle(Color.red)
            } else if let report = reviewedReport {
                if let risk = report.riskSummary, let unsaved = report.unsaved, risk.risky > 0 {
                    TransitionRiskReview(summary: risk, files: unsaved.risky, showsFiles: $showsRiskFiles)
                } else {
                    Label {
                        Text(report.riskSummary?.title ?? "Ready to update.")
                    } icon: {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var preconditionIndicator: (symbol: String, tone: StatusTone) {
        switch precondition {
        case .upToDate: ("checkmark.circle.fill", .positive)
        case .notKitV3: ("exclamationmark.circle.fill", .warning)
        case .unresolvedConflicts: ("xmark.octagon.fill", .critical)
        default: ("info.circle", .neutral)
        }
    }

    private var preconditionHelp: String? {
        switch precondition {
        case .notKitV3, .unresolvedConflicts: blockedReason
        case .notOnMain: "The project's kit commit isn't on main in your kit folder, or the project uses another template."
        default: precondition.reason
        }
    }

    private var blockedReason: String? {
        switch precondition {
        case .notKitV3: "Only projects made with kit v3 can be updated here."
        case .unresolvedConflicts: "Resolve the conflicts left by an earlier update first."
        case .pinned: "This project is locked to a specific kit version."
        case .notOnMain: "This project's kit version cannot be updated here."
        case .kitUnavailable: "Can't reach the latest kit. Check the kit folder in Settings."
        case .noBranch: "Switch to a branch before updating."
        case .upToDate: "Already up to date with the latest kit."
        case .ready: nil
        }
    }

    private func branchDetails(update: String?, previous: String? = nil) -> some View {
        DisclosureGroup("Branch details") {
            VStack(alignment: .leading, spacing: 8) {
                if let update {
                    branchRow("Update branch", value: update)
                }
                if let previous {
                    branchRow("Previous branch", value: previous)
                }
            }
        }
    }

    private func branchRow(_ title: String, value: String) -> some View {
        LabeledContent(title) {
            Text(value)
                .font(.callout.monospaced())
                .textSelection(.enabled)
                .lineLimit(2)
                .truncationMode(.middle)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var previewContent: some View {
        switch preview {
        case .failed(let message):
            FailureView(message: message)
            previewAgain
        case .loading:
            progress(isLoadingTargets ? "Checking upgrade targets…" : "Previewing upgrade…")
        case .idle:
            if isLoadingTargets || target != nil {
                progress(isLoadingTargets ? "Checking upgrade targets…" : "Previewing upgrade…")
            } else {
                Text("No preview yet.").foregroundStyle(.secondary)
                previewAgain
            }
        case .loaded:
            if reviewedReport?.upToDate == true {
                Text("Nothing to upgrade.").foregroundStyle(.secondary)
            } else {
                Label("This preview is no longer current.", systemImage: "clock")
                    .foregroundStyle(.secondary)
                previewAgain
            }
        }
    }

    private var previewAgain: some View {
        Button("Preview Again", systemImage: "arrow.clockwise") {
            resetPreview()
            isLoadingTargets = true
            generation += 1
        }
        .buttonStyle(.glass)
        .disabled(model.cliStatus != .ready)
    }

    private func resetPreview() {
        preview = .idle
        branchName = nil
        backsUp = true
        showsRiskFiles = false
    }

    private func loadTargets(for revision: Int) async {
        guard case .review = phase, revision == generation else { return }
        isLoadingTargets = true
        if revision > 0 { await model.refresh(project, force: true) }
        do {
            let choices = try await model.upgradeTargets(for: project)
            guard !Task.isCancelled, revision == generation else { return }
            mainTarget = choices.main
            switch choices.releases {
            case .success(let eligible):
                releases = eligible
                releaseError = nil
            case .failure(let error):
                releases = []
                releaseError = error.localizedDescription
            }
            if let selectedTag, target == nil {
                preview = .failed("\(selectedTag) is no longer available for this upgrade. Choose origin/main or another release.")
            }
        } catch {
            guard !Task.isCancelled, revision == generation else { return }
            mainTarget = nil
            releases = []
            preview = .failed(error.localizedDescription)
        }
        isLoadingTargets = false
    }

    private func loadPreview(_ request: PreviewRequest) async {
        guard case .review = phase, request == previewRequest, let target = request.target else { return }
        preview = .loading
        let branch = await model.proposedUpgradeBranch(for: project, target: target)
        guard !Task.isCancelled, request == previewRequest else { return }
        branchName = branch
        do {
            let review = try await model.loadUpgradePreview(project, target: target)
            guard !Task.isCancelled, request == previewRequest else { return }
            preview = .loaded(review, stale: false)
        } catch {
            guard !Task.isCancelled, request == previewRequest else { return }
            preview = .failed(error.localizedDescription)
        }
    }

    private func progress(_ text: String) -> some View {
        HStack(spacing: 8) {
            ProgressView().controlSize(.small)
            Text(text).font(.callout).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func finished(_ outcome: UpgradeOutcome) -> some View {
        switch outcome {
        case .launched(let branch):
            VStack(alignment: .leading, spacing: 6) {
                Label("Update applied.", systemImage: "checkmark.circle.fill")
                    .font(.callout.weight(.medium))
                    .foregroundStyle(Color.green)
                branchDetails(update: branch)
                Text("Claude is open in Terminal to resolve the conflicts and run the follow-ups. Nothing is committed.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        case .applied(let branch, let report, _):
            VStack(alignment: .leading, spacing: 10) {
                Label("Update applied.", systemImage: "checkmark.circle.fill")
                    .font(.callout.weight(.medium))
                    .foregroundStyle(Color.green)
                branchDetails(update: branch)
                if report.conflicts.isEmpty {
                    Text("Review the changes and commit them when you are happy. Nothing is committed.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    Text("Some files conflict with your changes. Review them in Last Update or resolve them with Claude. Nothing is committed.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                TransitionReportSummary(report: report, modules: snapshot?.kitState.map { Set($0.modules) })
                if let resolveError { FailureView(resolveError) }
            }
        case .failed(let branch, let error):
            VStack(alignment: .leading, spacing: 10) {
                FailureView(error)
                if let rollbackError { FailureView(rollbackError) }
                if let branch {
                    Label {
                        Text(rollbackRecord?.keepsChanges == true
                            ? "Still on the update branch. Your changes are untouched; switching back keeps them."
                            : "Still on the branch this update created.")
                    } icon: {
                        Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.orange)
                    }
                    .font(.callout)
                    branchDetails(update: branch)
                }
            }
        }
    }

    // MARK: Footer

    private var canUpgrade: Bool {
        guard let report = reviewedReport, report.upToDate != true else { return false }
        return model.canUpgrade(project)
    }

    private var confirmHelp: String {
        if let preconditionHelp { return preconditionHelp }
        if model.cliStatus != .ready { return "Build the nuxt-saas CLI first" }
        guard let report = reviewedReport else { return "A current update preview is required" }
        if report.upToDate == true { return "Already up to date with the latest kit" }
        return "Apply the reviewed upgrade on a new branch"
    }

    /// The branch the app created and the one it started from, read from the model, not the snapshot.
    private var rollbackRecord: UpgradeBranchRecord? { model.rollbackRecord(for: project) }

    @ViewBuilder
    private var footer: some View {
        HStack(spacing: 10) {
            switch phase {
            case .review:
                secondaryButton("Cancel", role: .cancel) { dismiss() }.keyboardShortcut(.cancelAction)
                Spacer()
                Button("Apply upgrade") { start() }
                    .buttonStyle(.glassProminent)
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canUpgrade)
                    .help(confirmHelp)
            case .running, .rollingBack:
                Spacer()
            case .finished(.failed(let branch, _)):
                if let branch, let record = rollbackRecord, record.branch == branch {
                    RollbackButton(project: project, record: record) { rollBack() }
                }
                Spacer()
                secondaryButton("Close") { dismiss() }.keyboardShortcut(.cancelAction)
            case .finished(.applied(let branch, let report, let prompt)) where !report.conflicts.isEmpty:
                Button("Resolve with Claude", systemImage: "sparkles") { resolve(branch: branch, prompt: prompt) }
                    .buttonStyle(.glass)
                Spacer()
                Button("Done") { dismiss() }
                    .buttonStyle(.glassProminent)
                    .keyboardShortcut(.defaultAction)
            case .finished, .rolledBack:
                Spacer()
                Button("Done") { dismiss() }
                    .buttonStyle(.glassProminent)
                    .keyboardShortcut(.defaultAction)
            }
        }
    }

    private func secondaryButton(_ title: String, role: ButtonRole? = nil, action: @escaping () -> Void) -> some View {
        Button(title, role: role, action: action)
            .buttonStyle(.glass)
    }

    // MARK: Actions

    private func start() {
        guard canUpgrade, let review else { return }
        rollbackError = nil
        resolveError = nil
        phase = .running
        let backup = backsUp
        Task {
            do {
                phase = .finished(try await model.runUpgrade(project, reviewed: review, backup: backup))
            } catch {
                resetPreview()
                preview = .failed(error.localizedDescription)
                phase = .review
            }
        }
    }

    private func resolve(branch: String, prompt: UpgradePromptInput) {
        resolveError = nil
        Task {
            do {
                try await model.launchUpgradeResolution(project, prompt: prompt)
                phase = .finished(.launched(branch: branch))
            } catch {
                resolveError = PresentedError(error)
            }
        }
    }

    private func rollBack() {
        guard case .finished(let outcome) = phase, case .failed(let branch?, _) = outcome,
            let previous = rollbackRecord?.previous
        else { return }
        rollbackError = nil
        phase = .rollingBack
        Task {
            do {
                try await model.rollBackUpgrade(project, branch: branch, previous: previous)
                phase = .rolledBack
            } catch {
                // Back to the failed state, so the rollback can be retried.
                rollbackError = PresentedError(error)
                phase = .finished(outcome)
            }
        }
    }
}
