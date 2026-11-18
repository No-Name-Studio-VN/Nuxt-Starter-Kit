import Foundation

public struct GitStatus: Sendable, Equatable {
    /// Full commit hash of HEAD; nil in a repository without commits.
    public let head: String?
    /// Current branch; nil when HEAD is detached.
    public let branch: String?
    /// Modified, staged, unmerged and untracked entries.
    public let dirtyCount: Int
    /// Commits ahead of / behind the upstream; nil when the branch has no upstream.
    public let ahead: Int?
    public let behind: Int?
    public let lastCommitDate: Date?

    public init(head: String?, branch: String?, dirtyCount: Int, ahead: Int?, behind: Int?, lastCommitDate: Date?) {
        self.head = head
        self.branch = branch
        self.dirtyCount = dirtyCount
        self.ahead = ahead
        self.behind = behind
        self.lastCommitDate = lastCommitDate
    }
}
