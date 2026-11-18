/// An upgrade branch the app created from a verified clean working tree. Rolling back discards
/// uncommitted changes, which is only safe for a branch with this history.
public struct UpgradeBranchRecord: Sendable, Equatable {
    public let branch: String
    /// The branch that was checked out when the upgrade started.
    public let previous: String
    /// The branch holds edits the user made, not only the upgrade's, so rolling back must never discard.
    public let keepsChanges: Bool

    public init(branch: String, previous: String, keepsChanges: Bool = false) {
        self.branch = branch
        self.previous = previous
        self.keepsChanges = keepsChanges
    }
}
