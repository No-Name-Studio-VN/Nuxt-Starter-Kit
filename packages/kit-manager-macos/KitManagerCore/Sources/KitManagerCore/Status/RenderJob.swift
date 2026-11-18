/// A CLI render still to run. `target` is the commit to upgrade to; nil uses the recorded template.
public struct RenderJob: Sendable, Equatable {
    public let recordedCommit: String
    public let source: KitSourceMode
    public let target: String?

    public init(recordedCommit: String, source: KitSourceMode, target: String?) {
        self.recordedCommit = recordedCommit
        self.source = source
        self.target = target
    }

    /// The key a result is stored under. A recorded-source preview only learns its target from the
    /// report (`resolvedTarget`); an inspect result has none, so it passes nil.
    public func cacheKey(fingerprint: String, resolvedTarget: String? = nil) -> CacheKey {
        CacheKey(
            fingerprint: fingerprint, recordedCommit: recordedCommit, targetCommit: target ?? resolvedTarget ?? "")
    }
}
