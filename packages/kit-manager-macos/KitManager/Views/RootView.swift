import KitManagerCore
import SwiftData
import SwiftUI

/// The main window's sidebar, browser column and detail, or the first-run welcome screen.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @Query(sort: \Project.addedAt) private var projects: [Project]

    @State private var moduleSelection: String?
    @State private var releaseSelection: String?
    @State private var releases: Loadable<[ReleaseSection]> = .idle
    @State private var searchText = ""
    @State private var importRequest: ImportRequest?
    @State private var isScanning = false

    var body: some View {
        Group {
            if projects.isEmpty {
                NavigationSplitView {
                    SidebarView(projectCount: 0)
                } detail: {
                    WelcomeView(isScanning: isScanning, importRequest: $importRequest)
                }
            } else {
                NavigationSplitView {
                    SidebarView(projectCount: projects.count)
                } content: {
                    content
                } detail: {
                    detail
                        .toolbar {
                            if model.sidebar.isProjectList {
                                ProjectListToolbar(isScanning: isScanning, importRequest: $importRequest)
                            }
                        }
                }
                .searchable(text: $searchText, placement: .sidebar, prompt: "Search")
            }
        }
        .frame(minWidth: 900, minHeight: 560)
        .modifier(ProjectImporter(request: $importRequest, isScanning: $isScanning))
        .task {
            await model.bootstrap()
            #if DEBUG
            DebugLaunchOptions.apply(to: model, projects: projects)
            #endif
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.refreshAll() } }
        }
        .onChange(of: projects.map(\.id)) { _, ids in
            if let id = model.selectedProjectID, !ids.contains(id) { model.selectedProjectID = nil }
        }
        .onChange(of: model.sidebar) { _, item in
            if !item.isProjectList { model.selectedProjectID = nil }
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
    private var content: some View {
        switch model.sidebar {
        case .allProjects, .needsAttention, .status:
            ProjectListView(
                projects: projects, searchText: searchText, importRequest: $importRequest)
        case .modules:
            ModulesListView(selection: $moduleSelection)
        case .whatsNew:
            ReleasesListView(selection: $releaseSelection, releases: $releases)
        }
    }

    @ViewBuilder
    private var detail: some View {
        if let id = model.selectedProjectID, let project = projects.first(where: { $0.id == id }) {
            ProjectDetailView(project: project)
                .id(id)
        } else {
            OverviewView(projects: projects, importRequest: $importRequest, isScanning: isScanning)
        }
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
