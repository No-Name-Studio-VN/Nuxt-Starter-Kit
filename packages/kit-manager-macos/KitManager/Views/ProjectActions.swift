import KitManagerCore
import SwiftUI

/// VS Code, Terminal and Claude buttons plus a menu, shown in the last table column.
struct ProjectActions: View {
    let row: ProjectRow
    let onLocate: () -> Void

    @Environment(AppModel.self) private var model

    var body: some View {
        GlassEffectContainer(spacing: 6) {
            HStack(spacing: 6) {
                iconButton("Open in VS Code", symbol: "chevron.left.forwardslash.chevron.right") {
                    await model.openInVSCode(row.project)
                }
                iconButton("Open in Terminal", symbol: "terminal") {
                    await model.openTerminal(row.project, command: .shell)
                }
                iconButton("Start Claude in Terminal", symbol: "sparkles") {
                    await model.openTerminal(row.project, command: .claude)
                }
                menu
            }
        }
        .disabled(row.snapshot == nil)
    }

    private func iconButton(_ title: String, symbol: String, action: @escaping () async -> Void) -> some View {
        Button {
            Task { await action() }
        } label: {
            Label(title, systemImage: symbol)
                .labelStyle(.iconOnly)
                .frame(width: 18, height: 18)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
        .controlSize(.small)
        .disabled(row.isMissing)
        .help(title)
    }

    private var menu: some View {
        Menu {
            ProjectMenuItems(project: row.project, isMissing: row.isMissing, onLocate: onLocate)
        } label: {
            Label("More actions", systemImage: "ellipsis")
                .labelStyle(.iconOnly)
                .frame(width: 18, height: 18)
        }
        .menuStyle(.button)
        .buttonStyle(.glass)
        .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
        .menuIndicator(.hidden)
        .controlSize(.small)
        .fixedSize()
        .help("More actions")
    }
}
