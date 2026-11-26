import Foundation

/// A one-time upgrade destination, resolved before review. The CLI always receives the commit, not the ref.
public struct UpgradeTarget: Sendable, Hashable {
    public let commit: String
    public let label: String
    public let isRelease: Bool

    public static func main(commit: String, label: String?) -> Self {
        Self(commit: commit, label: label ?? String(commit.prefix(7)), isRelease: false)
    }

    static func release(commit: String, tag: String) -> Self {
        Self(commit: commit, label: tag, isRelease: true)
    }
}

/// A preview belongs to a specific project, working tree and kit destination.
public struct UpgradeReview: Sendable, Equatable {
    public struct Context: Sendable, Equatable {
        public let id: UUID
        public let url: URL
        public let state: KitState
        public let branch: String
        public let fingerprint: String
        public let kitPath: String

        public init(id: UUID, url: URL, state: KitState, branch: String, fingerprint: String, kitPath: String) {
            self.id = id
            self.url = url
            self.state = state
            self.branch = branch
            self.fingerprint = fingerprint
            self.kitPath = kitPath
        }
    }

    public let context: Context
    public let target: UpgradeTarget
    public let report: TransitionReport

    public init?(context: Context, target: UpgradeTarget, report: TransitionReport) {
        guard report.from == context.state.commit, report.to == target.commit, !report.applied else { return nil }
        self.context = context
        self.target = target
        self.report = report
    }

    public func matches(context: Context, report: TransitionReport) -> Bool {
        self.context == context && self.report.matchesUpgradePreview(report)
    }
}

extension TransitionReport {
    /// The CLI generates the same report for an unchanged plan. A change in risk, files or modules
    /// requires another review, even if the upgrade did not originally need `--force`.
    func matchesUpgradePreview(_ current: TransitionReport) -> Bool {
        !applied && upToDate != true && self == current
    }
}
