/// The numbers shown next to a "behind" badge: how costly the upgrade looks.
public struct PreviewSummary: Codable, Sendable, Equatable {
    public let counts: [ChangeKind: Int]
    public let conflicts: Int
    public let files: Int

    public init(counts: [ChangeKind: Int], conflicts: Int, files: Int) {
        self.counts = counts
        self.conflicts = conflicts
        self.files = files
    }

    public init(report: TransitionReport) {
        self.init(
            counts: report.changes.reduce(into: [:]) { $0[$1.kind, default: 0] += 1 },
            conflicts: report.conflicts.count,
            files: report.changes.count)
    }
}
