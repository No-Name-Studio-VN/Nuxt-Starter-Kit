import Foundation

public enum ReleaseGrouper {
    /// Buckets `commits` (newest first) under release tags. `tags` maps a commit SHA to the version
    /// tags pointing at it. A tagged commit is the newest commit of its release, so it starts a
    /// section and the older commits below it belong to that section until the next tagged commit.
    /// Commits above the newest tag form a section with no tag.
    public static func sections(commits: [KitCommit], tags: [String: [String]]) -> [ReleaseSection] {
        var sections: [ReleaseSection] = []
        var currentTag: String?
        var current: [KitCommit] = []
        for commit in commits {
            if let tag = highest(tags[commit.id] ?? []) {
                if !current.isEmpty { sections.append(ReleaseSection(tag: currentTag, commits: current)) }
                currentTag = tag
                current = []
            }
            current.append(commit)
        }
        if !current.isEmpty { sections.append(ReleaseSection(tag: currentTag, commits: current)) }
        return sections
    }

    /// `v3.10.0` is higher than `v3.9.0`.
    private static func highest(_ tags: [String]) -> String? {
        tags.max { $0.compare($1, options: .numeric) == .orderedAscending }
    }
}
