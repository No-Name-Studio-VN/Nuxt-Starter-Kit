import SwiftUI

/// Opens a project in its tools and exposes the other project actions.
struct OpenButtons: View {
    let project: Project
    let row: ProjectRow
    var onLocate: () -> Void
    var compact = false
    var showsMenu = true

    @Environment(AppModel.self) private var model

    var body: some View {
        // Read outside the menu, whose content is built without this view's environment.
        let flowItem = model.flowMenuItem(for: project)
        GlassEffectContainer(spacing: 8) {
            HStack(spacing: 8) {
                openButton("VS Code", symbol: "chevron.left.forwardslash.chevron.right") {
                    await model.openInVSCode(project)
                }
                openButton("Terminal", symbol: "terminal") {
                    await model.openTerminal(project, command: .shell)
                }
                openButton("Claude", symbol: "sparkle", help: "Start Claude in Terminal") {
                    await model.openTerminal(project, command: .claude)
                }
                if showsMenu {
                    Menu {
                        ProjectMenuItems(
                            model: model, project: project, isMissing: row.isMissing, flowItem: flowItem, onLocate: onLocate)
                    } label: {
                        Label("More actions", systemImage: "ellipsis")
                            .labelStyle(.iconOnly)
                    }
                    .menuStyle(.button)
                    .menuIndicator(.hidden)
                    .buttonStyle(.glass)
                    .buttonBorderShape(.circle)
                    .fixedSize()
                    .help("More actions")
                }
            }
        }
        .controlSize(showsMenu ? (compact ? .regular : .large) : .small)
        .disabled(row.snapshot == nil)
    }

    private func openButton(
        _ title: String, symbol: String, help: String? = nil, action: @escaping () async -> Void
    ) -> some View {
        let actionName = help ?? "Open in \(title)"
        return Button {
            Task { await action() }
        } label: {
            if compact {
                Label(title, systemImage: symbol).labelStyle(.iconOnly)
            } else {
                Label(title, systemImage: symbol)
            }
        }
        .buttonStyle(.glass)
        .disabled(row.isMissing)
        .accessibilityLabel(actionName)
        .help(actionName)
    }
}
