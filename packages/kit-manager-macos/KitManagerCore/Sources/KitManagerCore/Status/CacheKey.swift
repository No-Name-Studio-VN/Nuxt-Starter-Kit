/// What a cached preview or inspect result was computed for. A result is reused only when
/// all three parts match the current state (spec 2.3).
public struct CacheKey: Codable, Sendable, Hashable {
    /// Working-tree fingerprint from `GitInspector.fingerprint`.
    public let fingerprint: String
    public let recordedCommit: String
    public let targetCommit: String

    public init(fingerprint: String, recordedCommit: String, targetCommit: String) {
        self.fingerprint = fingerprint
        self.recordedCommit = recordedCommit
        self.targetCommit = targetCommit
    }
}
