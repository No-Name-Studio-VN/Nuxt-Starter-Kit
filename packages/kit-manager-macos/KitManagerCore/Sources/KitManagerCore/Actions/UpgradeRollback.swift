/// Decides what "Switch back and delete branch" may do. Discarding changes is the one destructive
/// step in the upgrade flow, so it is only ever planned for the exact branch the app created from a
/// clean tree, and only while that branch is still checked out.
public enum UpgradeRollback {
    public enum Step: Sendable, Equatable {
        /// `git reset --hard`, `git clean -fd`, switch to the previous branch, delete the upgrade branch.
        case discardSwitchAndDelete
        /// Already back on the previous branch: only delete the upgrade branch.
        case deleteOnly
        case refuse(String)
    }

    /// - Parameters:
    ///   - record: What the app stored when it created the branch; nil when it created none.
    ///   - branch, previous: What the caller asks to roll back.
    ///   - current: The branch checked out right now; nil for a detached HEAD.
    public static func plan(record: UpgradeBranchRecord?, branch: String, previous: String, current: String?) -> Step {
        guard record == UpgradeBranchRecord(branch: branch, previous: previous) else {
            return .refuse("\(branch) was not created by this upgrade, so it will not be discarded.")
        }
        if current == branch { return .discardSwitchAndDelete }
        if current == previous { return .deleteOnly }
        return .refuse("Switch to \(previous) or \(branch) first.")
    }
}
