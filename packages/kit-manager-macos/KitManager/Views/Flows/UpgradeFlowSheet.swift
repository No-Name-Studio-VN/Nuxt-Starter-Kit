import KitManagerCore
import SwiftUI

/// Confirms an upgrade (spec 2.8): the preconditions, the latest preview and the branch it will use.
/// On confirm the project moves to a new branch, the CLI applies the upgrade, and Claude opens in Terminal.
struct UpgradeFlowSheet: View {
    let project: Project

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var phase: UpgradeFlowPhase = .review
    @State private var branchName: String?
    @State private var backsUp = true
    @State private var showsRiskFiles = false
    @State private var isRefreshingPreview = true
    /// Why the last "Switch back" failed; the button stays so it can be retried.
    @State private var rollbackError: PresentedError?
    /// Why "Resolve with Claude" could not open Terminal; the button stays so it can be retried.
    @State private var resolveError: PresentedError?

    private var snapshot: ProjectSnapshot? { model.snapshots[project.id] }

    private var precondition: UpgradePrecondition { model.upgradePrecondition(project) }

    private var isBusy: Bool {
        switch phase {
        case .running, .rollingBack: true
        case .review, .finished, .rolledBack: false
        }
    }

    var body: some View {
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
        .task(id: model.latestMain) {
            guard case .review = phase else { return }
            branchName = await model.proposedUpgradeBranch(for: project)
            await refreshPreview()
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

    private var reviewedReport: TransitionReport? {
        guard !isRefreshingPreview, case .loaded(let report, stale: false) = snapshot?.preview,
            report.from == snapshot?.kitState?.commit, report.to == model.latestMain
        else { return nil }
        return report
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .review:
            Section {
                versions
                preconditionRow
                if branchName != nil || snapshot?.git?.branch != nil {
                    branchDetails(update: branchName, previous: snapshot?.git?.branch)
                }
            } header: {
                Text(model.targetLabel.map { "Update to Kit \($0.trimmingPrefix("v"))" } ?? "Kit Update")
                    .accessibilityAddTraits(.isHeader)
            }
            if let report = reviewedReport, report.upToDate != true {
                Section {
                    TransitionBackupToggle(backsUp: $backsUp, hasUnsaved: (report.unsaved?.total ?? 0) > 0)
                }
                Section("Preview (nothing is changed yet)") {
                    TransitionGroupedCounts(counts: report.groupedCounts)
                    ChangeFileList(report: report, modules: snapshot?.kitState.map { Set($0.modules) }, limit: 6)
                }
            } else {
                Section("Preview (nothing is changed yet)") {
                    preview
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
        HStack(spacing: 8) {
            Text(snapshot?.versionLabel ?? snapshot?.kitState.map { String($0.commit.prefix(7)) } ?? "—")
                .foregroundStyle(.secondary)
            Image(systemName: "arrow.right").foregroundStyle(.secondary).accessibilityLabel("to")
            Text(model.targetLabel ?? "—")
                .fontWeight(.medium)
            if let counts = reviewedReport?.groupedCounts {
                Spacer(minLength: 8)
                let changed = counts.appliedAutomatically
                Text("\(changed) \(changed == 1 ? "file changes" : "files change") · \(counts.newFiles) new")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
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
    private var preview: some View {
        if isRefreshingPreview {
            progress("Previewing update…")
        } else {
            switch snapshot?.preview ?? .idle {
            case .idle:
                Text("No preview yet.").foregroundStyle(.secondary)
            case .loading:
                progress("Previewing update…")
            case .failed(let message):
                FailureView(message: message)
                previewAgain
            case .loaded(_, true):
                Label("Computed for an earlier state of the project.", systemImage: "clock")
                    .foregroundStyle(.secondary)
                previewAgain
            case .loaded(_, false):
                if reviewedReport?.upToDate == true {
                    Text("Nothing to update.").foregroundStyle(.secondary)
                } else {
                    Label("Computed for an earlier state of the project.", systemImage: "clock")
                        .foregroundStyle(.secondary)
                    previewAgain
                }
            }
        }
    }

    private var previewAgain: some View {
        Button("Preview Again", systemImage: "arrow.clockwise") { Task { await refreshPreview() } }
            .buttonStyle(.glass)
            .disabled(model.cliStatus != .ready)
    }

    private func refreshPreview() async {
        isRefreshingPreview = true
        defer { isRefreshingPreview = false }
        guard model.canUpgrade(project) else { return }
        await model.loadPreview(project)
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
        return "Create the branch, apply the update and open Claude"
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
                secondaryButton("Update only") { start(withClaude: false) }
                    .disabled(!canUpgrade)
                    .help("Apply the update without opening Claude")
                Button {
                    start(withClaude: true)
                } label: {
                    Label("Update with Claude", systemImage: "sparkles")
                }
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
                secondaryButton("Done") { dismiss() }.keyboardShortcut(.cancelAction)
                Spacer()
                Button {
                    resolve(branch: branch, prompt: prompt)
                } label: {
                    Label("Resolve with Claude", systemImage: "sparkles")
                }
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

    private func start(withClaude: Bool) {
        guard canUpgrade, let report = reviewedReport else { return }
        rollbackError = nil
        resolveError = nil
        phase = .running
        let backup = backsUp
        Task {
            phase = .finished(await model.runUpgrade(project, withClaude: withClaude, reviewed: report, backup: backup))
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
