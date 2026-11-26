import Foundation
import KitManagerCore

struct DiffRequest: Identifiable {
    enum Source {
        case upstream(base: String?, head: String, modules: Set<String>?)
        case project(URL, [InspectFile])
    }

    let id: UUID
    let title: String
    let source: Source
    let focusPath: String?

    init(id: UUID = UUID(), title: String, base: String?, head: String, modules: Set<String>?, focusPath: String? = nil) {
        self.id = id
        self.title = title
        source = .upstream(base: base, head: head, modules: modules)
        self.focusPath = focusPath
    }

    init(project: URL, files: [InspectFile], focusPath: String) {
        id = UUID()
        title = "Project Changes"
        source = .project(project, files)
        self.focusPath = focusPath
    }
}

enum DiffComparison {
    case upstream(KitDiff, scoped: [DiffFile]?)
    case project(ProjectComparison, [DiffFile])

    var allFiles: [DiffFile] {
        switch self {
        case .upstream(let comparison, _): comparison.files
        case .project(_, let files): files
        }
    }

    var scopedFiles: [DiffFile]? {
        switch self {
        case .upstream(_, let scoped): scoped
        case .project(_, let files): files
        }
    }

    func patch(path: String, maxBytes: Int) async throws -> FilePatch {
        switch self {
        case .upstream(let comparison, _): try await comparison.patch(path: path, maxBytes: maxBytes)
        case .project(let comparison, _): try await comparison.patch(path: path, maxBytes: maxBytes)
        }
    }

    func close() {
        if case .project(let comparison, _) = self { comparison.close() }
    }
}
