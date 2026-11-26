import Foundation

extension AppModel {
    func beginProjectCreation() {
        guard flow == nil, !isSwitcherPresented else { return }
        flow = .newProject
    }

    /// Uses the same registration and refresh path as Add Existing Project.
    func openCreatedProject(at url: URL) -> Bool {
        let added = add(urls: [url])
        guard let project = fetchProjects().first(where: { $0.path == url.standardizedFileURL.path }) else { return false }
        sidebar = .allProjects
        moduleFilter = nil
        openDetail(project)
        // A missing folder can already be registered from before it was recreated.
        if added == 0 { Task { await refresh(project, force: true) } }
        return true
    }
}
