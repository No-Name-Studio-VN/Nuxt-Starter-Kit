import KitManagerCore
import SwiftUI

/// The actions shared by the row's "…" menu and the table's context menu.
struct ProjectMenuItems: View {
    let project: Project
    let isMissing: Bool
    let onLocate: () -> Void

    @Environment(AppModel.self) private var model

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
