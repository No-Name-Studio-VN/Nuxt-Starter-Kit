import Foundation
import Synchronization

struct ProjectComparisonReport: Decodable {
    let projectComparison: Bool
    let commit: String
}

struct ProjectFilePatchReport: Decodable {
    private enum Status: String, Decodable {
        case text, unchanged, missing, unavailable, binary, tooLarge
    }

    private let path: String
    private let status: Status
    private let patch: String?

    func patch(for requestedPath: String, maxBytes: Int) throws -> ProjectFilePatch {
        guard path.utf8.elementsEqual(requestedPath.utf8) else {
            throw CLIFailure.reported(message: "The CLI returned a patch for a different project file.", kind: "unexpected")
        }
        switch status {
        case .text:
            guard let patch, !patch.isEmpty else { return .unavailable }
            return patch.utf8.count <= maxBytes ? .text(patch) : .tooLarge
        case .unchanged: return .unchanged
        case .missing: return .missing
        case .unavailable: return .unavailable
        case .binary: return .binary
        case .tooLarge: return .tooLarge
        }
    }
}

public typealias ProjectFilePatch = FilePatch

/// A sheet's private copy of the rendered installed baseline. Each patch reads the selected file afresh.
public final class ProjectComparison: Sendable {
    public static let maximumPatchBytes = FilePatch.maximumBytes
    public let commit: String

    private let directory: URL
    private let closed = Mutex(false)
    private let load: @Sendable (String, Int) async throws -> ProjectFilePatch

    init(commit: String, directory: URL, load: @escaping @Sendable (String, Int) async throws -> ProjectFilePatch) {
        self.commit = commit
        self.directory = directory
        self.load = load
    }

    public func patch(path: String, maxBytes: Int = ProjectComparison.maximumPatchBytes) async throws -> ProjectFilePatch {
        try Task.checkCancellation()
        guard !closed.withLock({ $0 }) else { throw CLIFailure.projectComparisonClosed }
        guard !path.utf8.contains(0) else { return .unavailable }
        let patch = try await load(path, min(max(0, maxBytes), Self.maximumPatchBytes))
        try Task.checkCancellation()
        guard !closed.withLock({ $0 }) else { throw CLIFailure.projectComparisonClosed }
        return patch
    }

    /// Release the baseline on dismissal. The caller should also cancel any in-flight selections.
    public func close() {
        let shouldRemove = closed.withLock { value in
            if value { return false }
            value = true
            return true
        }
        if shouldRemove { try? FileManager.default.removeItem(at: directory) }
    }

    deinit { close() }
}
