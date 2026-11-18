/// Commits that shipped in one release, newest first. `tag` is nil for commits past the newest tag.
public struct ReleaseSection: Sendable, Equatable, Identifiable {
    public let tag: String?
    public let commits: [KitCommit]

    public init(tag: String?, commits: [KitCommit]) {
        self.tag = tag
        self.commits = commits
    }

    public var id: String { tag ?? "" }
}
