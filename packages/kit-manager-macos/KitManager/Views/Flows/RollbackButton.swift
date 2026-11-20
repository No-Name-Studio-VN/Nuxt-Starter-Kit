import KitManagerCore
import SwiftUI

/// Confirms before discarding a clean-start upgrade or restoring a dirty-start upgrade's backup.
struct RollbackButton: View {
    let project: Project
    let record: UpgradeBranchRecord
    let action: () -> Void

    @Environment(AppModel.self) private var model

    @State private var isConfirming = false
    @State private var isReadingChanges = false
    @State private var dirtyPaths: [String]?

    /// A dirty-start update without a backup has nothing to restore, and discarding would lose the user's work.
    private var hasNoBackup: Bool { record.startedDirty && !record.keepsChanges && record.backupName == nil }

    var body: some View {
        Button(record.keepsChanges ? "Switch back" : "Switch back and delete update branch…") {
            if record.keepsChanges {
                action()
            } else if record.startedDirty {
                isConfirming = true
            } else {
                confirm()
            }
        }
        .buttonStyle(.glass)
        .disabled(isReadingChanges || hasNoBackup)
        .help(hasNoBackup ? "No backup was taken for this update, so it can't be undone here. Nothing was discarded." : help)
        .alert(
            record.startedDirty ? "Restore the backup and switch back?" : "Discard all uncommitted changes on the update branch?",
            isPresented: $isConfirming
        ) {
            if record.startedDirty {
                Button("Restore Backup", action: action)
            } else {
                Button("Discard and Delete Branch", role: .destructive, action: action)
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            if record.startedDirty {
                Text("Restores your project to how it was before the update, then switches back and deletes the update branch. Kit Manager won't throw away work you've done since the update.")
            } else {
                Text(
                    "Discards all uncommitted changes on the update branch, including any you made since the update. Then it switches to your previous branch and deletes the update branch.\n\n\(changesSummary)"
                )
            }
        }
    }

    private var help: String {
        if record.keepsChanges {
            return "Switch back to \(record.previous) and delete \(record.branch). Your uncommitted changes are kept."
        }
        if record.startedDirty {
            return "Restore the backup, switch back to \(record.previous) and delete \(record.branch)."
        }
        return "Discard the uncommitted changes, switch back to \(record.previous) and delete \(record.branch)"
    }

    private var changesSummary: String {
        dirtyPaths.map { UpgradeRollback.discardSummary(paths: $0) } ?? "Could not read the uncommitted changes."
    }

    private func confirm() {
        isReadingChanges = true
        Task {
            dirtyPaths = await model.uncommittedPaths(project)
            isReadingChanges = false
            isConfirming = true
        }
    }
}
