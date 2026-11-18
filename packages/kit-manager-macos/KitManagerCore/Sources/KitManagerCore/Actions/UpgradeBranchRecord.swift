/// An upgrade branch the app created from a verified clean working tree. Rolling back discards
/// uncommitted changes, which is only safe for a branch with this history.
public struct UpgradeBranchRecord: Sendable, Equatable {
    public let branch: String
    /// The branch that was checked out when the upgrade started.
    public let previous: String

    public init(branch: String, previous: String) {
        self.branch = branch
        self.previous = previous
    }
}
