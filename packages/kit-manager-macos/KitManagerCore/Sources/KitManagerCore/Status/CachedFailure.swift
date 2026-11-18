/// A render that failed for a given key. It is remembered so the CLI is not re-run until the key
/// changes or the user asks again.
public struct CachedFailure: Sendable, Equatable {
    public let key: CacheKey
    public let message: String

    public init(key: CacheKey, message: String) {
        self.key = key
        self.message = message
    }
}
