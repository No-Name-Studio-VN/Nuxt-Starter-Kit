import KitManagerCore
import SwiftUI

/// The actions shared by the project's "…" menu and the project list's context menu.
struct ProjectMenuItems: View {
    /// Passed in, not read from the environment: menu content and table cells are built without it.
    let model: AppModel
    let project: Project
    let isMissing: Bool
    let flowItem: FlowMenuItem
    let onLocate: () -> Void

    var body: some View {
        if isMissing {
            Button("Locate…", systemImage: "folder.badge.questionmark", action: onLocate)
        } else {
            Button("Open in VS Code", systemImage: "chevron.left.forwardslash.chevron.right") {
                Task { await model.openInVSCode(project) }
            }
            Button("Open in Terminal", systemImage: "terminal") {
                Task { await model.openTerminal(project, command: .shell) }
            }
            Button("Start Claude", systemImage: "sparkles") {
                Task { await model.openTerminal(project, command: .claude) }
            }
            Button("Continue Claude Session", systemImage: "arrow.clockwise") {
                Task { await model.openTerminal(project, command: .claudeContinue) }
            }
            switch flowItem {
            case .none:
                EmptyView()
            case .upgrade(let isEnabled):
                Divider()
                Button("Upgrade with Claude…", systemImage: "sparkles") { model.flow = .upgrade(project) }
                    .disabled(!isEnabled)
            case .migrate:
                Divider()
                Button("Migrate with Claude…", systemImage: "sparkles") { model.flow = .migration(project) }
            }
            Divider()
            Button("Reveal in Finder", systemImage: "folder") {
                Task { await model.reveal(project) }
            }
        }
        Button("Copy Path", systemImage: "doc.on.doc") { model.copyPath(project) }
        Button("Refresh", systemImage: "arrow.clockwise") {
            Task { await model.refresh(project, force: true) }
        }
        Divider()
        Button("Remove from List", systemImage: "minus.circle", role: .destructive) {
            model.remove(project)
        }
    }
}
