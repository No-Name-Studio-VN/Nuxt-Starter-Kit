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
        let counts = model.counts(for: SidebarItem.projectItems, in: projects)
        Form {
            Section { header(counts: counts) }
            nextSteps
            OverviewLatestKit(latestLabel: latestLabel, anchor: anchor)
                .id(anchor)
            Section { footer }
        }
        .formStyle(.grouped)
        .defaultScrollAnchor(.top)
        .navigationTitle("Overview")
    }

    private func header(counts: [SidebarItem: Int]) -> some View {
        let attentionCount = counts[.needsAttention, default: 0]
        return VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Overview")
                    .font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)
                Text(attentionCount == 0
                    ? "Everything is up to date"
                    : "\(projects.count) \(projects.count == 1 ? "project" : "projects") · \(attentionCount) need attention")
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
            tiles(counts: counts)
        }
        .padding(.vertical, 6)
    }

    private func tiles(counts: [SidebarItem: Int]) -> some View {
        let projectsTile = tile("Projects", symbol: "square.stack.3d.up.fill", color: .gray,
            item: .allProjects, value: counts[.allProjects, default: 0])
        let upToDateTile = tile("Up to Date", symbol: "checkmark.circle.fill", color: .green,
            item: .status(.upToDate), value: counts[.status(.upToDate), default: 0])
        let updatesTile = tile("Updates", symbol: "arrow.down.circle.fill", color: .accentColor,
            item: .status(.updates), value: counts[.status(.updates), default: 0])
        let conflictsTile = tile("Conflicts", symbol: "exclamationmark.triangle.fill", color: .red,
            item: .needsAttention, value: conflictCount)
        let notOnKitTile = tile("Not on Kit", symbol: "arrow.triangle.merge", color: .orange,
            item: .status(.notOnKit), value: counts[.status(.notOnKit), default: 0])

        return ViewThatFits(in: .horizontal) {
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

    private func tile(_ title: String, symbol: String, color: Color, item: SidebarItem, value: Int) -> some View {
        OverviewTile(value: value, title: title, symbol: symbol, color: color) {
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
