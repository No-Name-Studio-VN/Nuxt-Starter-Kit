import Foundation

public struct CachedResult<Value: Codable & Sendable & Equatable>: Codable, Sendable, Equatable {
    public let key: CacheKey
    public let value: Value
    public let checkedAt: Date

    public init(key: CacheKey, value: Value, checkedAt: Date) {
        self.key = key
        self.value = value
        self.checkedAt = checkedAt
    }
}
