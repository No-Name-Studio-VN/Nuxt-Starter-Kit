import SwiftData
import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var scenePhase
    @Query(sort: \Project.addedAt) private var projects: [Project]

    @State private var selection: SidebarItem? = .allProjects
    @State private var path: [UUID] = []

    var body: some View {
        NavigationSplitView {
            SidebarView(selection: $selection)
        } detail: {
            NavigationStack(path: $path) {
                content
                    .navigationDestination(for: UUID.self) { id in
                        if let project = projects.first(where: { $0.id == id }) {
                            ProjectDetailPlaceholderView(
                                row: ProjectRow(project: project, snapshot: model.snapshots[id]))
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
        .onChange(of: selection) { path = [] }
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
        switch selection ?? .allProjects {
        case .allProjects:
            ProjectsTableView(projects: projects, scope: .allProjects, path: $path)
        case .needsAttention:
            ProjectsTableView(projects: projects, scope: .needsAttention, path: $path)
        case .modules:
            ComingSoonView(item: .modules)
        case .kit:
            ComingSoonView(item: .kit)
        }
    }
}
