import Foundation

public struct EnvCheck: Sendable, Equatable {
    public let hasExample: Bool
    public let hasEnv: Bool
    /// Keys in `.env.example` that `.env` does not define, sorted.
    public let missing: [String]

    public init(hasExample: Bool, hasEnv: Bool, missing: [String]) {
        self.hasExample = hasExample
        self.hasEnv = hasEnv
        self.missing = missing
    }
}
