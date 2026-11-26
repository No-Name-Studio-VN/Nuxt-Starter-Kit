import Foundation
import Observation

/// Result for one literal path, not a patch for the entire comparison.
public enum FilePatch: Sendable, Equatable {
    case text(String)
    case unchanged
    case missing
    case unavailable
    case binary
    case tooLarge

    public static let maximumBytes = 1_500_000
}

public struct DiffFile: Sendable, Identifiable {
    public enum Status: String, Sendable {
        case added = "A", modified = "M", deleted = "D", renamed = "R", copied = "C", typeChanged = "T"
    }

    // Git paths are byte-exact; Unicode spellings that Swift considers equal can be separate files.
    public let id: Data
    public let path: String
    public let status: Status
    public let previousPath: String?

    public init(path: String, status: Status, previousPath: String? = nil) {
        id = Data(path.utf8)
        self.path = path
        self.status = status
        self.previousPath = previousPath
    }

    public func matches(path: String) -> Bool {
        self.path.utf8.elementsEqual(path.utf8) || previousPath?.utf8.elementsEqual(path.utf8) == true
    }
}

/// An upstream comparison fixes both revisions and lists files without keeping their patches.
public struct KitDiff: Sendable {
    let changes: [Change]
    let load: @Sendable (Change, Int) async throws -> FilePatch

    public var files: [DiffFile] { changes.map(\.file) }

    public func files(ownedBy modules: Set<String>, using mapping: ModuleMapping) -> [DiffFile] {
        files.filter { file in
            !mapping.paths([file.previousPath, file.path].compactMap { $0 }, ownedBy: modules).isEmpty
        }
    }

    public func file(at path: String) -> DiffFile? { change(at: path)?.file }

    public func patch(path: String, maxBytes: Int = FilePatch.maximumBytes) async throws -> FilePatch {
        try Task.checkCancellation()
        guard let change = change(at: path) else { return .missing }
        return try await load(change, min(max(0, maxBytes), FilePatch.maximumBytes))
    }

    private func change(at path: String) -> Change? { changes.first { $0.file.matches(path: path) } }

    struct Change: Sendable {
        let file: DiffFile
        let modes: [String]
        let objects: [String]

        static func parse(_ data: Data) -> [Change] {
            var fields = data.split(separator: 0).makeIterator()
            var changes: [Change] = []
            while let raw = fields.next(), let path = fields.next() {
                let header = String(decoding: raw, as: UTF8.self).dropFirst().split(separator: " ")
                guard header.count == 5, let code = header[4].first else { break }
                let paired = code == "R" || code == "C"
                let destination = paired ? fields.next() : path
                guard let destination, let status = DiffFile.Status(rawValue: String(code)),
                    let name = String(data: destination, encoding: .utf8), let source = String(data: path, encoding: .utf8)
                else { continue }
                changes.append(Change(
                    file: DiffFile(path: name, status: status, previousPath: paired ? source : nil),
                    modes: header.prefix(2).map(String.init), objects: header[2...3].map(String.init)))
            }
            return changes
        }
    }
}

/// One selection's patch. The layout is presentation only and does not invalidate the result.
@MainActor @Observable
public final class FileDiffSelection {
    private var id: DiffFile.ID?
    private var generation = UUID()
    private var result: Loadable<FilePatch> = .idle

    public init() {}

    public func patch(for file: DiffFile) -> Loadable<FilePatch> { id == file.id ? result : .idle }

    public func load(_ file: DiffFile?, patch: (String) async throws -> FilePatch) async {
        guard !Task.isCancelled else { return }
        if id == file?.id, case .loaded = result { return }
        id = file?.id
        let token = UUID()
        generation = token
        guard let file else {
            result = .idle
            return
        }
        result = .loading
        let loaded: Loadable<FilePatch>
        do {
            loaded = .loaded(try await patch(file.path), stale: false)
        } catch {
            loaded = .failed(error.localizedDescription)
        }
        guard generation == token, !Task.isCancelled else { return }
        result = loaded
    }
}
