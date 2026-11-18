import KitManagerCore
import SwiftUI

/// VS Code, Terminal and Claude buttons plus a menu, shown in the last table column.
struct ProjectActions: View {
    let row: ProjectRow
    /// Passed in, not read from the environment: table cells can be built without it.
    let model: AppModel
    /// The menu bar list has no room for the "…" menu.
    var showsMenu = true
    var onLocate: () -> Void = {}

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
                if showsMenu {
                    menu(flowItem: model.flowMenuItem(for: row.project))
                }
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
        .controlSize(.small)
        .disabled(row.isMissing)
        .help(title)
    }

    private func menu(flowItem: FlowMenuItem) -> some View {
        Menu {
            ProjectMenuItems(
                model: model, project: row.project, isMissing: row.isMissing, flowItem: flowItem, onLocate: onLocate)
        } label: {
            Label("More actions", systemImage: "ellipsis")
                .labelStyle(.iconOnly)
                .frame(width: 18, height: 18)
        }
        .menuStyle(.button)
        .buttonStyle(.glass)
        .menuIndicator(.hidden)
        .controlSize(.small)
        .fixedSize()
        .help("More actions")
    }
}
