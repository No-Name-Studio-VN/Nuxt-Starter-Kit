import KitManagerCore
import SwiftData
import SwiftUI

/// The main window's sidebar, browser column and detail, or the first-run welcome screen.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    #if DEBUG
    @Environment(\.openSettings) private var openSettings
    #endif
    @Query(sort: \Project.addedAt) private var projects: [Project]

    @State private var moduleSelection: String?
    @State private var releaseSelection: String?
    @State private var releases: Loadable<[ReleaseSection]> = .idle
    @State private var searchText = ""
    @State private var importRequest: ImportRequest?
    @State private var isScanning = false
    @State private var projectsToRemove: Set<UUID> = []

    private var moduleColumns: [ModuleMatrix.Column] {
        ModuleMatrix.columns(from: projects.compactMap { project in
            model.snapshots[project.id].map { (id: project.id, snapshot: $0) }
        })
    }

    var body: some View {
        let columns = model.sidebar == .modules || moduleSelection != nil ? moduleColumns : []
        let rows = columns.isEmpty ? [] : ModuleMatrix.rows(catalogue: model.catalogue, columns: columns)
        Group {
            if projects.isEmpty && model.sidebar.isProjectList {
                NavigationSplitView {
                    sidebar
                } detail: {
                    WelcomeView(isScanning: isScanning, importRequest: $importRequest)
                }
            } else {
                NavigationSplitView {
                    sidebar
                } content: {
                    content(moduleRows: rows, kitProjectCount: columns.count)
                } detail: {
                    detail(moduleRows: rows)
                        .toolbar {
                            if model.sidebar.isProjectList {
                                ProjectListToolbar(isScanning: isScanning, importRequest: $importRequest)
                            }
                        }
                }
            }
        }
        .frame(minWidth: 900, minHeight: 560)
        .modifier(ProjectDropTarget())
        .modifier(ProjectImporter(request: $importRequest, isScanning: $isScanning))
        .task {
            await model.bootstrap()
            #if DEBUG
            DebugLaunchOptions.apply(to: model, projects: projects)
            if DebugLaunchOptions.showsSettings { openSettings() }
            if model.sidebar == .modules, let id = DebugLaunchOptions.moduleSelection,
                !moduleColumns.isEmpty, model.catalogue.contains(where: { $0.id == id })
            {
                moduleSelection = id
            }
            if model.sidebar == .whatsNew, let id = DebugLaunchOptions.releaseSelection {
                releaseSelection = id
            }
            #endif
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.refreshAll() } }
        }
        .onChange(of: projects.map(\.id)) { _, ids in
            model.selection.formIntersection(ids)
        }
        .onChange(of: rows.map(\.id)) { _, ids in
            if let id = moduleSelection, !ids.contains(id) { moduleSelection = nil }
        }
        .onChange(of: model.sidebar) { _, item in
            if !item.isProjectList { searchText = "" }
        }
        .onDisappear { model.isSwitcherPresented = false }
        .sheet(isPresented: Bindable(model).isSwitcherPresented) {
            SwitcherView(
                projects: projects, model: model,
                onOpen: model.openDetail,
                onClaude: { project in
                    model.isSwitcherPresented = false
                    Task { await model.openTerminal(project, command: .claude) }
                })
        }
        .sheet(item: Bindable(model).flow) { request in
            flowSheet(for: request)
        }
        .confirmationDialog(
            "Remove \(projectsToRemove.count) projects from the list?",
            isPresented: Binding(
                get: { !projectsToRemove.isEmpty }, set: { if !$0 { projectsToRemove = [] } }),
            titleVisibility: .visible,
            presenting: projectsToRemove
        ) { ids in
            Button("Remove from List", role: .destructive) {
                for project in projects where ids.contains(project.id) { model.remove(project) }
            }
        } message: { _ in
            Text("The project folders won't be changed.")
        }
        .alert(
            "Something went wrong",
            isPresented: Binding(
                get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
    }

    @ViewBuilder
    private var sidebar: some View {
        let sidebar = SidebarView(projects: projects)
        if model.sidebar.isProjectList, !projects.isEmpty {
            sidebar.searchable(text: $searchText, placement: .sidebar, prompt: "Search")
        } else {
            sidebar
        }
    }

    @ViewBuilder
    private func content(moduleRows: [ModuleMatrix.Row], kitProjectCount: Int) -> some View {
        switch model.sidebar {
        case .allProjects, .needsAttention, .status:
            ProjectListView(
                projects: projects, searchText: searchText, importRequest: $importRequest,
                onRemoveProjects: { projectsToRemove = $0 })
        case .modules:
            ModulesListView(rows: moduleRows, kitProjectCount: kitProjectCount, selection: $moduleSelection)
        case .whatsNew:
            ReleasesListView(selection: $releaseSelection, releases: $releases)
        }
    }

    @ViewBuilder
    private func detail(moduleRows: [ModuleMatrix.Row]) -> some View {
        switch model.sidebar {
        case .allProjects, .needsAttention, .status:
            if model.selection.count > 1 {
                multipleSelection
            } else if let id = model.selectedProjectID, let project = projects.first(where: { $0.id == id }) {
                ProjectDetailView(project: project)
                    .id(id)
            } else {
                OverviewView(projects: projects, importRequest: $importRequest, isScanning: isScanning)
            }
        case .modules:
            if let id = moduleSelection, let row = moduleRows.first(where: { $0.id == id }) {
                ModuleDetailView(row: row, projects: projects)
                    .id(id)
            } else {
                ContentUnavailableView("Select a module", systemImage: SidebarItem.modules.symbol)
            }
        case .whatsNew:
            if model.canLoadKitChangelog, model.changelogAnchor != nil, let id = releaseSelection,
                let release = releases.value?.first(where: { $0.id == id })
            {
                ReleaseDetailView(release: release, projects: projects)
                    .id(id)
            } else {
                ContentUnavailableView("Select a release", systemImage: "shippingbox")
            }
        }
    }

    private var multipleSelection: some View {
        let ids = model.selection
        return ContentUnavailableView {
            Label("\(ids.count) Projects Selected", systemImage: "square.stack.3d.up")
        } actions: {
            HStack(spacing: 8) {
                Button("Refresh") { Task { await model.refreshProjects(ids, force: true) } }
                    .buttonStyle(.glass)
                Button("Remove from List", role: .destructive) { projectsToRemove = ids }
                    .buttonStyle(.glass)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    @ViewBuilder
    private func flowSheet(for request: FlowRequest) -> some View {
        switch request {
        case .upgrade(let project):
            UpgradeFlowSheet(project: project)
        case .migration(let project):
            if let snapshot = model.snapshots[project.id] {
                MigrationFlowSheet(project: project, snapshot: snapshot, catalogue: model.catalogue)
            } else {
                ContentUnavailableView {
                    Label("Project not read yet", systemImage: "questionmark.folder")
                } description: {
                    Text("Kit Manager has not finished reading this project, so it cannot prepare a migration. Try again in a moment.")
                } actions: {
                    Button("Close") { model.flow = nil }
                        .keyboardShortcut(.cancelAction)
                }
                .frame(width: 440, height: 240)
            }
        }
    }
}
