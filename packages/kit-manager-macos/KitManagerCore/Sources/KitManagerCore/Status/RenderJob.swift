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

    /// Inspect reads only the recorded commit and the working tree, so a moving `origin/main` must not
    /// invalidate it: its key has no target.
    public func inspectCacheKey(fingerprint: String) -> CacheKey {
        Self.inspectKey(recordedCommit: recordedCommit, fingerprint: fingerprint)
    }

    /// The one definition of an inspect key, shared by the planner (what it checks) and the job
    /// (what the loader stores), so the two cannot drift apart.
    static func inspectKey(recordedCommit: String, fingerprint: String) -> CacheKey {
        CacheKey(fingerprint: fingerprint, recordedCommit: recordedCommit, targetCommit: "")
    }

    public enum Result: Sendable {
        case preview
        case inspect
    }

    /// The key under which a finished render, or its failure, is stored. The loader always goes through this.
    public func storageKey(for result: Result, fingerprint: String, resolvedTarget: String? = nil) -> CacheKey {
        switch result {
        case .preview: cacheKey(fingerprint: fingerprint, resolvedTarget: resolvedTarget)
        case .inspect: inspectCacheKey(fingerprint: fingerprint)
        }
    }
}
