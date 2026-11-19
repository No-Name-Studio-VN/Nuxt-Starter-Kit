public enum ChangelogGrouper {
    /// A flat project changelog, newest first within the breaking and regular changes.
    public static func visibleCommits(_ commits: [KitCommit], installed: Set<String>, showAll: Bool) -> [KitCommit] {
        let visible = showAll ? commits : commits.filter { $0.isRelevant(to: installed) }
        return visible.sorted { lhs, rhs in
            if lhs.breaking != rhs.breaking { return lhs.breaking }
            return lhs.date > rhs.date
        }
    }

    /// `base` first, the rest alphabetical.
    public static func ordered(_ modules: [String]) -> [String] {
        modules.sorted { lhs, rhs in
            if lhs == ModuleMapping.base { return rhs != ModuleMapping.base }
            if rhs == ModuleMapping.base { return false }
            return lhs < rhs
        }
    }
}
