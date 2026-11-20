import KitManagerCore
import SwiftUI

/// Restores only the backup that belongs to the displayed report, never an older update's backup.
struct RestoreBackupRows: View {
    let project: Project
    let report: SavedReport

    @Environment(AppModel.self) private var model
    @State private var check: UndoReport?
    @State private var checkedRequest: CheckRequest?
    @State private var checkError: PresentedError?
    @State private var restoreError: PresentedError?
    @State private var confirmation: Backup?
    @State private var isRestoring = false
    @State private var checkAttempt = 0

    private var backup: Backup? { report.transition.backup }
    private var canRestore: Bool {
        // A check made for an earlier project state or CLI status must not enable restore.
        checkedRequest == request && check?.restorable == true && check?.backup?.name == backup?.name
            && check?.backup != nil && !isRestoring
    }

    private struct CheckRequest: Equatable {
        let backup: String?
        let revision: Int
        let cliStatus: CLIStatus
        let attempt: Int
    }

    private var request: CheckRequest {
        CheckRequest(backup: backup?.name, revision: model.snapshotRevisions[project.id, default: 0],
            cliStatus: model.cliStatus, attempt: checkAttempt)
    }

    var body: some View {
        let request = request
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) {
                heading
                Spacer(minLength: 0)
                restoreButton
            }
            VStack(alignment: .leading, spacing: 8) {
                heading
                restoreButton
            }
        }
        .task(id: request) { await checkRestore(request) }
        .alert(
            restoreTitle,
            isPresented: Binding(get: { confirmation != nil }, set: { if !$0 { confirmation = nil } }),
            presenting: confirmation
        ) { backup in
            Button("Restore Backup") { restore(backup) }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("This removes the update.")
        }

        if let restoreError { FailureView(restoreError) }
        if let checkError {
            FailureView(checkError)
            Button("Check Again", systemImage: "arrow.clockwise") { checkAttempt += 1 }
                .buttonStyle(.glass)
        } else if isRestoring {
            ProgressView("Restoring backup…").controlSize(.small)
        } else if let blocked = check?.blocked {
            if blocked.reason == .changes {
                blockedByChanges(blocked)
            } else {
                note(blocked.displayMessage)
            }
        } else if backup == nil {
            note("No backup was made for this update.")
        } else if model.cliStatus != .ready {
            note("Build the nuxt-saas CLI to check whether the backup can be restored.")
        } else if check == nil {
            ProgressView("Checking backup…").controlSize(.small)
        }
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.headline)
            note(subtitle)
        }
        .accessibilityElement(children: .combine)
    }

    private var title: String {
        switch report.command {
        case .upgrade: report.toVersion.map { "Updated to Kit \($0)" } ?? "Updated Kit"
        case .add: "Added modules"
        case .remove: "Removed modules"
        }
    }

    private var subtitle: String {
        let date = report.createdAt.formatted(.relative(presentation: .named))
        let time = report.createdAt.formatted(date: .omitted, time: .shortened)
        let stamp: String
        if Calendar.current.isDateInToday(report.createdAt) {
            stamp = "Today at \(time)"
        } else if Calendar.current.isDateInYesterday(report.createdAt) {
            stamp = "Yesterday at \(time)"
        } else {
            stamp = date.prefix(1).uppercased() + date.dropFirst()
        }
        guard let backup = check?.backup ?? (check?.blocked?.reason == .noBackup ? nil : backup) else { return stamp }
        return "\(stamp) · \(backup.expiryLabel())"
    }

    private var restoreButton: some View {
        Button("Restore Backup…", systemImage: "arrow.uturn.backward") {
            if canRestore { confirmation = check?.backup }
        }
            .buttonStyle(.glass)
            .fixedSize()
            .disabled(!canRestore)
    }

    private var restoreTitle: String {
        guard let confirmation else { return "Restore Backup?" }
        let name = ProjectRow(project: project, snapshot: model.snapshots[project.id]).name
        let date = confirmation.createdAt.formatted(date: .abbreviated, time: .shortened)
        return "Put \(name) back to how it was on \(date)?"
    }

    private func blockedByChanges(_ blocked: UndoBlocked) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label {
                note(blocked.displayMessage)
            } icon: {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            }
            .accessibilityElement(children: .combine)
            if !blocked.paths.isEmpty {
                DisclosureGroup("Show Files") {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(blocked.paths, id: \.self) { path in
                                Text(path).font(.caption.monospaced()).textSelection(.enabled)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 140)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.orange.opacity(0.10), in: .rect(cornerRadius: 8))
    }

    private func note(_ text: String) -> some View {
        Text(text).font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
    }

    private func checkRestore(_ request: CheckRequest) async {
        check = nil
        checkedRequest = nil
        checkError = nil
        guard let backup = request.backup, request.cliStatus == .ready else { return }
        do {
            let result = try await model.checkBackup(project, named: backup)
            if !Task.isCancelled {
                check = result
                checkedRequest = request
            }
        } catch {
            if !Task.isCancelled { checkError = PresentedError(error) }
        }
    }

    private func restore(_ backup: Backup) {
        isRestoring = true
        restoreError = nil
        Task {
            do {
                try await model.restoreBackup(project, named: backup.name)
            } catch {
                restoreError = PresentedError(error)
                await model.refresh(project, force: true)
            }
            isRestoring = false
        }
    }
}
