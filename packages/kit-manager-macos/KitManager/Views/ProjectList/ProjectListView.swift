import KitManagerCore
import SwiftUI

/// The project list, narrowed by the sidebar, module and search filters.
struct ProjectListView: View {
    let projects: [Project]
    let searchText: String
    @Binding var importRequest: ImportRequest?
    let onRemoveProjects: (Set<UUID>) -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @AppStorage("projectSort") private var sort: ProjectSort = .status

    private var rows: [ProjectRow] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        return projects
            .map { ProjectRow(project: $0, snapshot: model.snapshots[$0.id]) }
            .filter { row in
                // Keep selected rows visible when their status or modules change, but still apply search.
                (model.selection.contains(row.id) || model.matchesProjectFilters(row.snapshot))
                    && (query.isEmpty
                        || row.name.localizedStandardContains(query)
                        || row.project.path.localizedStandardContains(query))
            }
            .sorted { lhs, rhs in
                switch sort {
                case .status:
                    if lhs.statusRank != rhs.statusRank { return lhs.statusRank > rhs.statusRank }
                case .dateAdded:
                    if lhs.project.addedAt != rhs.project.addedAt { return lhs.project.addedAt > rhs.project.addedAt }
                case .name:
                    break
                }
                return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
            }
    }

    private var showsCLIBanner: Bool {
        // With no project selected the banner lives in the Overview instead.
        !model.selection.isEmpty && model.cliStatus != .ready
    }

    private var showsTopBar: Bool {
        showsCLIBanner || model.moduleFilter != nil
    }

    var body: some View {
        let rows = rows
        Group {
            if rows.isEmpty {
                emptyState
            } else {
                list(rows)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .safeAreaInset(edge: .top, spacing: 0) {
            VStack(alignment: .leading, spacing: 8) {
                if showsCLIBanner {
                    CLIBanner(status: model.cliStatus)
                        .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                }
                if let module = model.moduleFilter {
                    ModuleFilterChip(module: module) { model.moduleFilter = nil }
                        .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, showsTopBar ? 16 : 0)
            .padding(.bottom, showsTopBar ? 4 : 0)
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: showsCLIBanner)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: model.moduleFilter)
        .navigationTitle(model.sidebar.title)
        .navigationSubtitle(rows.count == 1 ? "1 project" : "\(rows.count) projects")
        .navigationSplitViewColumnWidth(min: 260, ideal: 300)
        .toolbar { toolbar }
    }

    private func list(_ rows: [ProjectRow]) -> some View {
        List(selection: Bindable(model).selection) {
            if sort == .status {
                section("Needs Attention", rows: rows.filter { !$0.attention.isEmpty })
                section("Everything Else", rows: rows.filter { $0.attention.isEmpty })
            } else {
                ForEach(rows) { ProjectListRow(row: $0) }
            }
        }
        .contextMenu(forSelectionType: UUID.self) { ids in
            contextMenu(for: ids)
        }
        .accessibilityLabel("Projects")
    }

    @ViewBuilder
    private func section(_ title: String, rows: [ProjectRow]) -> some View {
        if !rows.isEmpty {
            Section(title) {
                ForEach(rows) { ProjectListRow(row: $0) }
            }
        }
    }

    @ViewBuilder
    private func contextMenu(for ids: Set<UUID>) -> some View {
        if ids.count == 1, let project = projects.first(where: { ids.contains($0.id) }) {
            let row = ProjectRow(project: project, snapshot: model.snapshots[project.id])
            Button("Open Details", systemImage: "arrow.right.circle") { model.openDetail(project) }
            Divider()
            ProjectMenuItems(
                model: model, project: project, isMissing: row.isMissing,
                flowItem: model.flowMenuItem(for: project)
            ) {
                importRequest = .locate(project)
            }
        } else if !ids.isEmpty {
            Button("Refresh", systemImage: "arrow.clockwise") {
                Task { await model.refreshProjects(ids, force: true) }
            }
            Button("Remove from List", systemImage: "minus.circle", role: .destructive) {
                onRemoveProjects(ids)
            }
        }
    }

    @ViewBuilder
    private var emptyState: some View {
        if !searchText.isEmpty {
            ContentUnavailableView.search(text: searchText)
        } else if let module = model.moduleFilter {
            ContentUnavailableView {
                Label(
                    model.sidebar == .needsAttention ? "Nothing needs attention with \(module)" : "No projects with \(module)",
                    systemImage: "square.grid.3x3")
            } actions: {
                Button("Clear Filter") { model.moduleFilter = nil }.buttonStyle(.glass)
            }
        } else {
            switch model.sidebar {
            case .status(.upToDate):
                ContentUnavailableView("No projects are up to date", systemImage: model.sidebar.symbol)
            case .status(.updates):
                ContentUnavailableView("No updates available", systemImage: model.sidebar.symbol)
            case .status(.notOnKit):
                ContentUnavailableView("Every project is on the kit", systemImage: model.sidebar.symbol)
            default:
                ContentUnavailableView(
                    "Nothing needs attention", systemImage: "checkmark.circle",
                    description: Text("Every project is up to date and healthy."))
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem {
            Menu {
                Picker("Sort By", selection: $sort) {
                    ForEach(ProjectSort.allCases, id: \.self) { option in
                        Text(option.title).tag(option)
                    }
                }
            } label: {
                Label("Sort", systemImage: "line.3.horizontal.decrease")
            }
            .help("Sort projects")
        }
    }
}
