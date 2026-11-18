/// Decides what "Switch back and delete branch" may do. Discarding changes is the one destructive
/// step in the upgrade flow, so it is only ever planned for the exact branch the app created from a
/// clean tree, and only while that branch is still checked out.
public enum UpgradeRollback {
    public enum Step: Sendable, Equatable {
        /// `git reset --hard`, `git clean -fd`, switch to the previous branch, delete the upgrade branch.
        case discardSwitchAndDelete
        /// `git switch` to the previous branch (which carries uncommitted changes along or refuses), then
        /// delete the upgrade branch. Nothing is discarded.
        case switchKeepingChanges
        /// Already back on the previous branch: only delete the upgrade branch.
        case deleteOnly
        case refuse(String)
    }

    /// - Parameters:
    ///   - record: What the app stored when it created the branch; nil when it created none.
    ///   - branch, previous: What the caller asks to roll back.
    ///   - current: The branch checked out right now; nil for a detached HEAD.
    public static func plan(record: UpgradeBranchRecord?, branch: String, previous: String, current: String?) -> Step {
        guard let record, record.branch == branch, record.previous == previous else {
            return .refuse("\(branch) was not created by this upgrade, so it will not be discarded.")
        }
        if current == branch { return record.keepsChanges ? .switchKeepingChanges : .discardSwitchAndDelete }
        if current == previous { return .deleteOnly }
        return .refuse("Switch to \(previous) or \(branch) first.")
    }

    /// The paths a discard would throw away, one per line, capped so the alert stays readable.
    public static func discardSummary(paths: [String], limit: Int = 8) -> String {
        guard !paths.isEmpty else { return "No uncommitted changes." }
        var lines = Array(paths.prefix(limit))
        if paths.count > limit { lines.append("and \(paths.count - limit) more") }
        return lines.joined(separator: "\n")
    }
}
