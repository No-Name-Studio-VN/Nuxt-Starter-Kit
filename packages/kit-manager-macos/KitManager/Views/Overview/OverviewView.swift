import KitManagerCore
import SwiftUI

/// The project overview shown when no project is selected.
struct OverviewView: View {
    let projects: [Project]
    @Binding var importRequest: ImportRequest?
    let isScanning: Bool

    @Environment(AppModel.self) private var model

    private var latestLabel: String {
        model.latestLabel ?? model.latestMain.map { String($0.prefix(7)) } ?? "—"
    }

    private var conflictCount: Int {
        projects.count { project in
            guard let snapshot = model.snapshots[project.id] else { return false }
            if case .unresolvedConflicts = ProjectStatus(snapshot: snapshot) { return true }
            return false
        }
    }

    var body: some View {
        // An anchor is discovered during the first project refresh, after latestMain is known.
        let anchor = model.canLoadKitChangelog ? model.changelogAnchor : nil
        Form {
            Section { header }
            nextSteps
            OverviewLatestKit(latestLabel: latestLabel, anchor: anchor)
                .id(anchor)
            Section { footer }
        }
        .formStyle(.grouped)
        .defaultScrollAnchor(.top)
        .navigationTitle("Overview")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Overview")
                    .font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)
                Text(model.attentionCount == 0
                    ? "Everything is up to date"
                    : "\(projects.count) \(projects.count == 1 ? "project" : "projects") · \(model.attentionCount) need attention")
                    .foregroundStyle(.secondary)
            }
            if model.cliStatus != .ready {
                CLIBanner(status: model.cliStatus)
            }
            if let reason = model.kitUnavailableReason {
                Label("Can't reach the kit. \(reason)", systemImage: "exclamationmark.triangle")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            tiles
        }
        .padding(.vertical, 6)
    }

    private var tiles: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                projectsTile
                upToDateTile
                updatesTile
                conflictsTile
                notOnKitTile
            }
            .frame(minWidth: 5 * 110 + 4 * 10)
            Grid(horizontalSpacing: 10, verticalSpacing: 10) {
                GridRow {
                    projectsTile
                    upToDateTile
                    updatesTile
                }
                GridRow {
                    conflictsTile
                    notOnKitTile
                }
            }
        }
    }

    private var projectsTile: some View {
        tile("Projects", symbol: "square.stack.3d.up.fill", color: .gray, item: .allProjects)
    }

    private var upToDateTile: some View {
        tile("Up to Date", symbol: "checkmark.circle.fill", color: .green, item: .status(.upToDate))
    }

    private var updatesTile: some View {
        tile("Updates", symbol: "arrow.down.circle.fill", color: .accentColor, item: .status(.updates))
    }

    private var conflictsTile: some View {
        tile("Conflicts", symbol: "exclamationmark.triangle.fill", color: .red, item: .needsAttention, value: conflictCount)
    }

    private var notOnKitTile: some View {
        tile("Not on Kit", symbol: "arrow.triangle.merge", color: .orange, item: .status(.notOnKit))
    }

    private func tile(_ title: String, symbol: String, color: Color, item: SidebarItem, value: Int? = nil) -> some View {
        OverviewTile(value: value ?? model.count(for: item), title: title, symbol: symbol, color: color) {
            model.sidebar = item
        }
    }

    private var nextSteps: some View {
        let steps = NextSteps.suggest(projects.compactMap { project in
            model.snapshots[project.id].map { (project.id, $0) }
        })
        return Section {
            if steps.isEmpty {
                Label {
                    Text("Nothing to do right now.")
                } icon: {
                    Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                }
            } else {
                ForEach(steps) { step in
                    if let project = projects.first(where: { $0.id == step.projectID }) {
                        OverviewStepRow(
                            step: step.kind,
                            row: ProjectRow(project: project, snapshot: model.snapshots[project.id]),
                            latestLabel: latestLabel)
                    }
                }
            }
        } header: {
            Text("Suggested Next Steps")
        }
    }

    private var footer: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) {
                footerNote
                Spacer(minLength: 0)
                importButtons
            }
            VStack(alignment: .leading, spacing: 8) {
                footerNote
                HStack {
                    Spacer(minLength: 0)
                    importButtons
                }
            }
        }
    }

    private var footerNote: some View {
        Text("Kit Manager only reads your projects until you click an action.")
            .font(.callout)
            .foregroundStyle(.secondary)
    }

    private var importButtons: some View {
        HStack(spacing: 8) {
            Button("Scan Folder…") { importRequest = .scan }
                .help("Find projects inside a folder")
                .disabled(isScanning)
            Button("Add Project…") { importRequest = .add }
                .help("Add project folders")
        }
        .buttonStyle(.bordered)
        .fixedSize()
    }
}
