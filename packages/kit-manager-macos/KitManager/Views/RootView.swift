import SwiftData
import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @Query(sort: \Project.addedAt) private var projects: [Project]

    @State private var selection: SidebarItem? = .allProjects
    @State private var path: [UUID] = []
    /// A detail page to open once a pending sidebar change has cleared the navigation path.
    @State private var pendingDetail: UUID?

    var body: some View {
        NavigationSplitView {
            SidebarView(selection: $selection)
        } detail: {
            NavigationStack(path: $path) {
                content
                    .navigationDestination(for: UUID.self) { id in
                        if let project = projects.first(where: { $0.id == id }) {
                            ProjectDetailView(project: project)
                        } else {
                            ContentUnavailableView("Project removed", systemImage: "questionmark.folder")
                        }
                    }
            }
        }
        .frame(minWidth: 900, minHeight: 520)
        .task { await model.bootstrap() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await model.refreshAll() } }
        }
        .onChange(of: selection) {
            path = pendingDetail.map { [$0] } ?? []
            pendingDetail = nil
        }
        .onChange(of: model.detailRequest, initial: true) { _, id in
            guard let id else { return }
            model.detailRequest = nil
            showDetail(id)
        }
        .onDisappear { model.isSwitcherPresented = false }
        .sheet(isPresented: Bindable(model).isSwitcherPresented) {
            SwitcherView(
                projects: projects, model: model,
                onOpen: { project in
                    model.isSwitcherPresented = false
                    model.openDetail(project)
                },
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
                .background(Theme.canvas)
            }
        }
    }

    /// Detail pages live under the project lists, so the other pages give way to All Projects first.
    private func showDetail(_ id: UUID) {
        switch selection ?? .allProjects {
        case .allProjects, .needsAttention:
            path = [id]
        case .modules, .kit:
            pendingDetail = id
            selection = .allProjects
        }
    }

    @ViewBuilder
    private var content: some View {
        switch selection ?? .allProjects {
        case .allProjects:
            ProjectsTableView(projects: projects, scope: .allProjects, path: $path)
        case .needsAttention:
            ProjectsTableView(projects: projects, scope: .needsAttention, path: $path)
        case .modules:
            ModulesMatrixView(projects: projects) { module in
                model.moduleFilter = module
                selection = .allProjects
            }
        case .kit:
            KitChangelogView()
        }
    }
}
