/// How "Upgrade with Claude" or "Upgrade only" ended.
enum UpgradeOutcome {
    /// The upgrade is applied on `branch` and Claude was opened in Terminal.
    case launched(branch: String)
    /// The upgrade is applied on `branch`; nothing else was started.
    case applied(branch: String)
    /// `branch` is the upgrade branch this run created, still checked out; nil when nothing was changed.
    case failed(branch: String?, error: PresentedError)
}
