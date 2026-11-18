import KitManagerCore
import SwiftUI

/// Confirms an upgrade (spec 2.8): the preconditions, the latest preview and the branch it will use.
/// On confirm the project moves to a new branch, the CLI applies the upgrade, and Claude opens in Terminal.
struct UpgradeFlowSheet: View {
    let project: Project

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var phase: Phase = .review
    @State private var branchName: String?
    @State private var isConfirmingRollback = false
    /// Why the last "Switch back and delete branch" failed; the button stays so it can be retried.
    @State private var rollbackError: PresentedError?
    @State private var contentHeight: CGFloat = 0

    private enum Phase {
        case review
        case running
        case finished(UpgradeOutcome)
        case rollingBack
        case rolledBack
    }

    private var snapshot: ProjectSnapshot? { model.snapshots[project.id] }

    private var precondition: UpgradePrecondition { model.upgradePrecondition(project) }

    private var isBusy: Bool {
        switch phase {
        case .running, .rollingBack: true
        case .review, .finished, .rolledBack: false
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Upgrade with Claude").font(.title2.weight(.semibold)).accessibilityAddTraits(.isHeader)
            ScrollView {
                content
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { contentHeight = $0 }
            }
            .frame(height: min(max(contentHeight, 40), 460))
            footer
        }
        .padding(20)
        .frame(width: 540)
        .background(Theme.canvas)
        .interactiveDismissDisabled(isBusy)
        .task {
            branchName = await model.proposedUpgradeBranch(for: project)
            switch snapshot?.preview {
            case .idle, .failed: await model.loadPreview(project)
            case .loading, .loaded, nil: break
            }
        }
        .alert(
            "Discard the upgrade's changes and delete \(failedBranch ?? "the branch")?",
            isPresented: $isConfirmingRollback
        ) {
            Button("Discard and Delete Branch", role: .destructive) { rollBack() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This throws away everything the upgrade changed, switches back to \(rollbackRecord?.previous ?? "your previous branch") and deletes the upgrade branch.")
        }
    }

    // MARK: Content

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .review:
            review
        case .running:
            progress("Creating the branch and applying the upgrade…")
        case .finished(let outcome):
            finished(outcome)
        case .rollingBack:
            progress("Switching back and deleting the branch…")
        case .rolledBack:
            Label("Back on your previous branch. The upgrade branch is gone.", systemImage: "checkmark.circle.fill")
                .font(.callout.weight(.medium))
                .foregroundStyle(Theme.green)
        }
    }

    private var review: some View {
        VStack(alignment: .leading, spacing: 14) {
            versions
            preconditionRow
            if let branch = branchName {
                detailRow("Branch", value: branch, monospaced: true)
            }
            if let previous = snapshot?.git?.branch {
                detailRow("Now on", value: previous, monospaced: true)
            }
            Divider().overlay(Theme.hairline)
            preview
        }
    }

    private var versions: some View {
        HStack(spacing: 8) {
            versionText(snapshot?.versionLabel ?? snapshot?.kitState.map { String($0.commit.prefix(7)) })
            Image(systemName: "arrow.right").foregroundStyle(.secondary).accessibilityLabel("to")
            versionText(model.targetLabel)
        }
        .font(.title3)
    }

    private func versionText(_ label: String?) -> some View {
        Text(label ?? "—").fontWeight(.medium)
    }

    private var preconditionRow: some View {
        Group {
            if let reason = precondition.reason {
                Label(reason, systemImage: "xmark.octagon.fill")
                    .foregroundStyle(Theme.red)
            } else if model.cliStatus != .ready {
                Label("Build the nuxt-saas CLI first.", systemImage: "xmark.octagon.fill")
                    .foregroundStyle(Theme.red)
            } else {
                Label("Ready: kit v3, no unresolved conflicts, clean working tree.", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(Theme.green)
            }
        }
        .font(.callout)
        .fixedSize(horizontal: false, vertical: true)
    }

    private func detailRow(_ title: String, value: String, monospaced: Bool) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(width: 56, alignment: .leading)
            Text(value)
                .font(monospaced ? .callout.monospaced() : .callout)
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
            Text("No preview yet.").font(.callout).foregroundStyle(.secondary)
        case .loading:
            progress("Previewing upgrade…")
        case .failed(let message):
            FailureView(message: message)
        case .loaded(let report, let stale):
            VStack(alignment: .leading, spacing: 10) {
                Text("Preview (nothing is changed yet)")
                    .font(.caption.weight(.semibold))
                    .tracking(0.8)
                    .textCase(.uppercase)
                    .foregroundStyle(.secondary)
                TransitionReportSummary(report: report)
                if stale {
                    Label("Computed for an earlier state of the project.", systemImage: "clock")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
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
                Label("Upgrade applied on \(branch).", systemImage: "checkmark.circle.fill")
                    .font(.callout.weight(.medium))
                    .foregroundStyle(Theme.green)
                Text("Claude is open in Terminal to resolve the conflicts and run the follow-ups. Nothing is committed.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        case .applied(let branch):
            VStack(alignment: .leading, spacing: 6) {
                Label("Upgrade applied on \(branch).", systemImage: "checkmark.circle.fill")
                    .font(.callout.weight(.medium))
                    .foregroundStyle(Theme.green)
                Text("Review the changes and commit them when you are happy. Nothing is committed.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
        case .failed(let branch, let error):
            VStack(alignment: .leading, spacing: 10) {
                FailureView(error)
                if let rollbackError { FailureView(rollbackError) }
                if let branch {
                    AmberNote("Still on \(branch), which started from a clean working tree.")
                }
            }
        }
    }

    // MARK: Footer

    private var failedBranch: String? {
        if case .finished(.failed(let branch, _)) = phase { return branch }
        return nil
    }

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
                Spacer()
                secondaryButton("Cancel", role: .cancel) { dismiss() }.keyboardShortcut(.cancelAction)
                if isPlainUpgrade {
                    secondaryButton("Upgrade only") { start(withClaude: false) }
                        .disabled(!canUpgrade)
                        .help("Apply the upgrade without opening Claude")
                }
                Button {
                    start(withClaude: true)
                } label: {
                    Label("Upgrade with Claude", systemImage: "sparkles")
                }
                .buttonStyle(.glassProminent)
                .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
                .keyboardShortcut(.defaultAction)
                .disabled(!canUpgrade)
                .help(canUpgrade ? "Create the branch, apply the upgrade and open Claude" : (precondition.reason ?? "Build the nuxt-saas CLI first"))
            case .running, .rollingBack:
                Spacer()
            case .finished(.failed(let branch, _)):
                if let branch, rollbackRecord?.branch == branch {
                    secondaryButton("Switch back and delete branch") { isConfirmingRollback = true }
                }
                Spacer()
                secondaryButton("Close") { dismiss() }.keyboardShortcut(.cancelAction)
            case .finished, .rolledBack:
                Spacer()
                Button("Done") { dismiss() }
                    .buttonStyle(.glassProminent)
                    .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
                    .keyboardShortcut(.defaultAction)
            }
        }
    }

    private func secondaryButton(_ title: String, role: ButtonRole? = nil, action: @escaping () -> Void) -> some View {
        Button(title, role: role, action: action)
            .buttonStyle(.glass)
            .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
    }

    // MARK: Actions

    private func start(withClaude: Bool) {
        rollbackError = nil
        phase = .running
        Task {
            phase = .finished(await model.runUpgrade(project, withClaude: withClaude))
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
