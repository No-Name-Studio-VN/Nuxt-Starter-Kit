import Foundation

public enum ScanService {
    private static let skippedDirectories: Set<String> = ["node_modules", ".git", ".output"]

    /// Walks `root` down to `depth` levels (the root is level 0) and returns every folder that is a
    /// kit or Nuxt project, sorted by path. A project is not searched further, so a monorepo's
    /// packages are not reported separately. Symlinked folders are not followed.
    public static func scan(_ root: URL, depth: Int = 2) -> [ScanCandidate] {
        var found: [ScanCandidate] = []
        walk(root.standardizedFileURL, level: 0, maxDepth: depth, into: &found)
        return found.sorted { $0.url.path < $1.url.path }
    }

    private static func walk(_ directory: URL, level: Int, maxDepth: Int, into found: inout [ScanCandidate]) {
        switch ProjectClassifier.classify(directory) {
        case .other, .missing:
            break
        case let kind:
            found.append(ScanCandidate(url: directory, kind: kind))
            return
        }
        guard level < maxDepth else { return }

        let keys: [URLResourceKey] = [.isDirectoryKey, .isSymbolicLinkKey]
        guard
            let children = try? FileManager.default.contentsOfDirectory(
                at: directory, includingPropertiesForKeys: keys)
        else {
            return
        }
        for child in children where !skippedDirectories.contains(child.lastPathComponent) {
            guard let values = try? child.resourceValues(forKeys: Set(keys)),
                values.isDirectory == true, values.isSymbolicLink != true
            else {
                continue
            }
            walk(child, level: level + 1, maxDepth: maxDepth, into: &found)
        }
    }
}
