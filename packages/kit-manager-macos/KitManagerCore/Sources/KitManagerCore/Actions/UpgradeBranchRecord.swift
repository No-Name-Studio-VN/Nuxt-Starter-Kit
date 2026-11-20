/// An upgrade branch the app created. Only a clean-start branch may be rolled back by discarding.
public struct UpgradeBranchRecord: Sendable, Equatable {
    public let branch: String
    /// The branch that was checked out when the upgrade started.
    public let previous: String
    /// A switch is all that remains: the upgrade made no changes, or they have already been undone.
    public let keepsChanges: Bool
    public let startedDirty: Bool
    /// The backup made for this upgrade, not an older one still in the project.
    public let backupName: String?

    public init(
        branch: String, previous: String, keepsChanges: Bool = false, startedDirty: Bool = false, backupName: String? = nil
    ) {
        self.branch = branch
        self.previous = previous
        self.keepsChanges = keepsChanges
        self.startedDirty = startedDirty
        self.backupName = backupName
    }
}
