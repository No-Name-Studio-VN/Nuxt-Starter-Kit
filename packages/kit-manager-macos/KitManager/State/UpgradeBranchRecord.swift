/// An upgrade branch this app created from a verified clean working tree. Rolling back discards
/// uncommitted changes, which is only safe for a branch with this history.
struct UpgradeBranchRecord: Equatable {
    let branch: String
    /// The branch that was checked out when the upgrade started.
    let previous: String
}
