import KitManagerCore

/// How "Upgrade with Claude" or "Upgrade only" ended.
enum UpgradeOutcome {
    /// The upgrade is applied on `branch` and Claude was opened in Terminal.
    case launched(branch: String)
    /// The upgrade is applied on `branch`; nothing else was started. `report` is the apply's own result, and
    /// `prompt` what "Resolve with Claude" would hand to Claude.
    case applied(branch: String, report: TransitionReport, prompt: UpgradePromptInput)
    /// `branch` is the upgrade branch this run created, still checked out; nil when nothing was changed.
    case failed(branch: String?, error: PresentedError)
}
