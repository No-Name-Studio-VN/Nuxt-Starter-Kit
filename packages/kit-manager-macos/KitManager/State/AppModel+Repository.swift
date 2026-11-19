import AppKit

extension AppModel {
    /// Opens the credential-free repository URL from the project's latest snapshot.
    func openRepository(_ project: Project) {
        guard let repository = snapshots[project.id]?.repositoryURL else { return }
        if !NSWorkspace.shared.open(repository) {
            errorMessage = "Could not open the repository in your browser."
        }
    }
}
