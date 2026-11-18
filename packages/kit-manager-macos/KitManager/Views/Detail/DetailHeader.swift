import KitManagerCore
import SwiftUI

/// Name, path, classification and the open buttons.
struct DetailHeader: View {
    let project: Project
    let snapshot: ProjectSnapshot?
    let onLocate: () -> Void

    @Environment(AppModel.self) private var model

    var body: some View {
        let row = ProjectRow(project: project, snapshot: snapshot)
        GlassCard {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 16) {
                    info(row)
                    Spacer(minLength: 16)
                    actions(row)
                }
                VStack(alignment: .leading, spacing: 14) {
                    info(row)
                    actions(row)
                }
            }
        }
    }

    private func info(_ row: ProjectRow) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(row.name)
                .font(.title.weight(.semibold))
                .lineLimit(1)
                .truncationMode(.middle)
                .accessibilityAddTraits(.isHeader)
            Text(row.displayPath)
                .font(.callout)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
                .textSelection(.enabled)
                .help(row.project.path)
            HStack(spacing: 8) {
                StatusBadge(status: row.status)
                if row.isKitProject {
                    Text(row.kitLabel)
                        .font(row.kitIsCommit ? .callout.monospaced() : .callout.weight(.medium))
                        .help("Kit version")
                        .accessibilityLabel("Kit version \(row.kitLabel)")
                }
                if !row.modules.isEmpty {
                    ModuleChips(modules: row.modules, limit: 5)
                }
            }
        }
    }

    private func actions(_ row: ProjectRow) -> some View {
        // Read here, not inside the menu: a menu's content is built outside this view's environment.
        let flowItem = model.flowMenuItem(for: project)
        return GlassEffectContainer(spacing: 6) {
            HStack(spacing: 6) {
                openButton("VS Code", symbol: "chevron.left.forwardslash.chevron.right", row: row) {
                    await model.openInVSCode(project)
                }
                openButton("Terminal", symbol: "terminal", row: row) {
                    await model.openTerminal(project, command: .shell)
                }
                openButton("Claude", symbol: "sparkles", row: row) {
                    await model.openTerminal(project, command: .claude)
                }
                Menu {
                    ProjectMenuItems(
                        model: model, project: project, isMissing: row.isMissing, flowItem: flowItem, onLocate: onLocate)
                } label: {
                    Label("More actions", systemImage: "ellipsis")
                        .labelStyle(.iconOnly)
                        .frame(width: 18, height: 18)
                }
                .menuStyle(.button)
                .buttonStyle(.glass)
                .menuIndicator(.hidden)
                .fixedSize()
                .help("More actions")
            }
        }
        .disabled(snapshot == nil)
    }

    private func openButton(
        _ title: String, symbol: String, row: ProjectRow, action: @escaping () async -> Void
    ) -> some View {
        Button {
            Task { await action() }
        } label: {
            Label(title, systemImage: symbol)
        }
        .buttonStyle(.glass)
        .disabled(row.isMissing)
        .help("Open in \(title)")
    }
}
