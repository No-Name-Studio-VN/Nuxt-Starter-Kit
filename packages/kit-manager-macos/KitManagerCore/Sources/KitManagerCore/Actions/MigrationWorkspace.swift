import Foundation

/// The temporary directories a migration prompt tells Claude to generate the fresh kit project into.
public enum MigrationWorkspace {
    private static let prefix = "kit-manager-migration-"

    public static func create(in base: URL = FileManager.default.temporaryDirectory) throws -> URL {
        let directory = base.appending(path: prefix + UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    /// Deletes this app's workspaces older than `olderThan`. Anything else in `base` is left alone.
    public static func removeStale(in base: URL = FileManager.default.temporaryDirectory, olderThan: Duration = .seconds(86_400)) {
        let fileManager = FileManager.default
        let cutoff = Date(timeIntervalSinceNow: -Double(olderThan.components.seconds))
        guard
            let entries = try? fileManager.contentsOfDirectory(at: base, includingPropertiesForKeys: [.contentModificationDateKey])
        else { return }
        for entry in entries where entry.lastPathComponent.hasPrefix(prefix) {
            let modified = try? entry.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
            if let modified, modified < cutoff {
                try? fileManager.removeItem(at: entry)
            }
        }
    }
}
