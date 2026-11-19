import KitManagerCore
import SwiftUI

/// Opens a project in its tools and exposes the other project actions.
struct OpenButtons: View {
    let project: Project
    let row: ProjectRow
    var onLocate: () -> Void
    var compact = false
    var showsMenu = true
    var preferredControlSize: ControlSize = .regular

    @Environment(AppModel.self) private var model

    var body: some View {
        // Read outside the menu, whose content is built without this view's environment.
        let flowItem = model.flowMenuItem(for: project)
        GlassEffectContainer(spacing: 8) {
            if compact || !showsMenu {
                actions(flowItem)
                    .controlSize(showsMenu ? .regular : .small)
            } else {
                ViewThatFits(in: .horizontal) {
                    actions(flowItem)
                        .controlSize(preferredControlSize)
                    actions(flowItem)
                        .controlSize(.small)
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(spacing: 8) {
                            editor
                            terminal
                        }
                        HStack(spacing: 8) {
                            claude
                            repository
                            menu(flowItem)
                        }
                    }
                    .controlSize(.regular)
                }
            }
        }
        .disabled(row.snapshot == nil)
    }

    private func actions(_ flowItem: FlowMenuItem) -> some View {
        HStack(spacing: 8) {
            editor
            terminal
            claude
            repository
            if showsMenu { menu(flowItem) }
        }
    }

    private var editor: some View {
        openButton("VS Code", symbol: "chevron.left.forwardslash.chevron.right") {
            await model.openInVSCode(project)
        }
    }

    private var terminal: some View {
        openButton("Terminal", symbol: "terminal") {
            await model.openTerminal(project, command: .shell)
        }
    }

    private var claude: some View {
        openButton("Claude", symbol: "sparkle", help: "Start Claude in Terminal") {
            await model.openTerminal(project, command: .claude)
        }
    }

    @ViewBuilder
    private var repository: some View {
        if let url = row.snapshot?.repositoryURL {
            OpenRepositoryButton(model: model, project: project, repository: url, showsActionTitle: false, compact: compact)
                .buttonStyle(.glass)
                .fixedSize()
                .disabled(row.isMissing)
        }
    }

    private func menu(_ flowItem: FlowMenuItem) -> some View {
        Menu {
            ProjectMenuItems(
                model: model, project: project, isMissing: row.isMissing, flowItem: flowItem,
                repositoryURL: row.snapshot?.repositoryURL, onLocate: onLocate)
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
        .fixedSize()
        .disabled(row.isMissing)
        .accessibilityLabel(actionName)
        .help(actionName)
    }
}

/// The repository action shared by the project header, menus and menu bar.
struct OpenRepositoryButton: View {
    let model: AppModel
    let project: Project
    let repository: URL
    var showsActionTitle = true
    var compact = false

    var body: some View {
        let host = RemoteWebURL.hostName(of: repository)
        let actionName = "Open on \(host)"
        let label = Label {
            Text(showsActionTitle ? actionName : host)
        } icon: {
            icon
        }
        Button {
            model.openRepository(project)
        } label: {
            if compact {
                label.labelStyle(.iconOnly)
            } else {
                label
            }
        }
        .accessibilityLabel(actionName)
        .help(actionName)
    }

    private var icon: Image {
        if repository.host()?.lowercased() == "github.com" {
            Image("GitHubMark")
        } else {
            Image(systemName: "arrow.up.right.square")
        }
    }
}
