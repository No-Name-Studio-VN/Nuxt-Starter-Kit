/// Commits that touched one module, newest first. `module` is nil for commits that ship nothing.
public struct ChangelogGroup: Sendable, Equatable, Identifiable {
    public let module: String?
    public let commits: [KitCommit]

    public init(module: String?, commits: [KitCommit]) {
        self.module = module
        self.commits = commits
    }

    public var id: String { module ?? "" }
}

public enum ChangelogGrouper {
    /// Groups `commits` (already newest first) by module for the "What's new" card. A commit that
    /// touched several modules appears under each. `base` comes first, then the installed modules,
    /// then, only with `showAll`, the other modules and a final group for commits that ship nothing.
    /// Without `showAll`, only `base` and installed modules appear.
    public static func groups(commits: [KitCommit], installed: Set<String>, showAll: Bool) -> [ChangelogGroup] {
        var byModule: [String: [KitCommit]] = [:]
        var unshipped: [KitCommit] = []
        for commit in commits {
            if commit.modules.isEmpty {
                unshipped.append(commit)
            }
            for module in commit.modules {
                byModule[module, default: []].append(commit)
            }
        }

        let relevant = byModule.keys.filter { $0 == ModuleMapping.base || installed.contains($0) }
        var groups = ordered(relevant).map { ChangelogGroup(module: $0, commits: byModule[$0] ?? []) }
        if showAll {
            let others = byModule.keys.filter { $0 != ModuleMapping.base && !installed.contains($0) }
            groups += others.sorted().map { ChangelogGroup(module: $0, commits: byModule[$0] ?? []) }
            if !unshipped.isEmpty {
                groups.append(ChangelogGroup(module: nil, commits: unshipped))
            }
        }
        return groups
    }

    /// `base` first, the rest alphabetical.
    private static func ordered(_ modules: [String]) -> [String] {
        modules.sorted { lhs, rhs in
            if lhs == ModuleMapping.base { return rhs != ModuleMapping.base }
            if rhs == ModuleMapping.base { return false }
            return lhs < rhs
        }
    }
}
