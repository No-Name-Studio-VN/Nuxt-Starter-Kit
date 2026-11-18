import KitManagerCore
import SwiftUI

/// "Switch back" for an upgrade branch the app created. When the branch only holds the upgrade's own
/// changes it discards them, so it first lists the files a discard would throw away (read from git
/// right now) and asks. When the branch holds the user's own edits it only switches, which never discards.
struct RollbackButton: View {
    let project: Project
    let record: UpgradeBranchRecord
    let action: () -> Void

    @Environment(AppModel.self) private var model

    @State private var isConfirming = false
    @State private var isReadingChanges = false
    @State private var dirtyPaths: [String]?

    var body: some View {
        Button(record.keepsChanges ? "Switch back" : "Switch back and delete update branch…") {
            if record.keepsChanges {
                action()
            } else {
                confirm()
            }
        }
        .buttonStyle(.glass)
        .disabled(isReadingChanges)
        .help(
            record.keepsChanges
                ? "Switch back to \(record.previous) and delete \(record.branch). Your uncommitted changes are kept."
                : "Discard the uncommitted changes, switch back to \(record.previous) and delete \(record.branch)"
        )
        .alert(
            "Discard all uncommitted changes on the update branch?",
            isPresented: $isConfirming
        ) {
            Button("Discard and Delete Branch", role: .destructive, action: action)
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(
                "Discards all uncommitted changes on the update branch, including any you made since the update. Then it switches to your previous branch and deletes the update branch.\n\n\(changesSummary)"
            )
        }
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
