import Foundation
import KitManagerCore

extension AppModel {
    func prepareDiff(_ request: DiffRequest) async throws -> DiffComparison {
        switch request.source {
        case .upstream(let base, let head, let modules):
            let mapping = mapping
            let comparison = try await kit.prepareDiff(from: base, to: head)
            let scoped: [DiffFile]?
            if let mapping, let modules {
                scoped = await Task.detached(priority: .userInitiated) {
                    comparison.files(ownedBy: modules, using: mapping)
                }.value
            } else {
                scoped = modules == nil ? comparison.files : nil
            }
            return .upstream(comparison, scoped: scoped)
        case .project(let project, let files):
            let comparison = try await cli.prepareProjectComparison(project: project)
            return .project(comparison, files.map {
                DiffFile(path: $0.path, status: $0.status == .deleted ? .deleted : .modified)
            })
        }
    }

    func projectDiffEditorFile(in project: URL, path: String) -> URL? {
        let root = project.standardizedFileURL.resolvingSymlinksInPath()
        let components = path.split(separator: "/", omittingEmptySubsequences: false)
        guard !path.utf8.contains(0), !components.isEmpty,
            components.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." })
        else { return nil }
        let file = root.appending(path: path).standardizedFileURL
        guard file.path.utf8.elementsEqual(file.resolvingSymlinksInPath().path.utf8),
            (try? file.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true
        else { return nil }
        return file
    }

    func openProjectDiffFile(in project: URL, path: String) async {
        await perform {
            guard let file = projectDiffEditorFile(in: project, path: path) else {
                throw UpdateReportError.actionNotApplied("That project file is no longer available to open.")
            }
            try await launcher.openInVSCode(file)
        }
    }
}
