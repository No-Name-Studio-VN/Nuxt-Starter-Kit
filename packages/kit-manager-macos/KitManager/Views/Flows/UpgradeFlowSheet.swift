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
            .frame(height: formHeight)
            Divider()
            footer.padding(20)
        }
        .frame(width: 540)
        .interactiveDismissDisabled(isBusy)
        .task {
            branchName = await model.proposedUpgradeBranch(for: project)
            switch snapshot?.preview {
            case .idle, .failed: await model.loadPreview(project)
            case .loading, .loaded, nil: break
            }
        }
    }

    private var formHeight: CGFloat {
        switch phase {
        case .review: snapshot?.preview.value?.changes.isEmpty == false ? 380 : 310
        case .finished(.applied): 380
        case .finished(.launched), .finished(.failed): 240
        case .running, .rollingBack, .rolledBack: 140
        }
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
                Text("Update with Claude").accessibilityAddTraits(.isHeader)
            }
            Section("Preview (nothing is changed yet)") {
                preview
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
        }
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
            } else {
                Label("Ready to update. Your project has no conflicts or unsaved changes.", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(Color.green)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    private var preconditionIndicator: (symbol: String, tone: StatusTone) {
        switch precondition {
        case .upToDate: ("checkmark.circle.fill", .positive)
        case .dirtyTree, .notKitV3: ("exclamationmark.circle.fill", .warning)
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
        case .dirtyTree: "Commit or stash your changes first."
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
        switch snapshot?.preview ?? .idle {
        case .idle:
            Text("No preview yet.").foregroundStyle(.secondary)
        case .loading:
            progress("Previewing update…")
        case .failed(let message):
            FailureView(message: message)
        case .loaded(let report, let stale):
            TransitionReportSummary(report: report)
            if stale {
                Label("Computed for an earlier state of the project.", systemImage: "clock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
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
                    Text("Some files conflict with your changes. Resolve them with Claude, or by hand. Nothing is committed.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                TransitionReportSummary(report: report)
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

    private var canUpgrade: Bool { model.canUpgrade(project) }

    /// The branch the app created and the one it started from, read from the model, not the snapshot.
    private var rollbackRecord: UpgradeBranchRecord? { model.rollbackRecord(for: project) }

    /// A loaded, current preview with nothing for Claude to do.
    private var isPlainUpgrade: Bool {
        guard case .loaded(let report, let stale) = snapshot?.preview ?? .idle else { return false }
        return !stale && report.conflicts.isEmpty && report.followUps.isEmpty
    }

    @ViewBuilder
    private var footer: some View {
        HStack(spacing: 10) {
            switch phase {
            case .review:
                secondaryButton("Cancel", role: .cancel) { dismiss() }.keyboardShortcut(.cancelAction)
                Spacer()
                if isPlainUpgrade {
                    secondaryButton("Update only") { start(withClaude: false) }
                        .disabled(!canUpgrade)
                        .help("Apply the update without opening Claude")
                }
                Button {
                    start(withClaude: true)
                } label: {
                    Label("Update with Claude", systemImage: "sparkles")
                }
                .buttonStyle(.glassProminent)
                .keyboardShortcut(.defaultAction)
                .disabled(!canUpgrade)
                .help(canUpgrade ? "Create the branch, apply the update and open Claude" : (preconditionHelp ?? "Build the nuxt-saas CLI first"))
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
        rollbackError = nil
        resolveError = nil
        phase = .running
        Task {
            phase = .finished(await model.runUpgrade(project, withClaude: withClaude))
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
