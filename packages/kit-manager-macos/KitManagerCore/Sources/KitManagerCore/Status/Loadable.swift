/// The state of a value that is computed in the background.
public enum Loadable<Value: Sendable & Equatable>: Sendable, Equatable {
    case idle
    case loading
    /// `stale` means the value was computed for an older working tree or kit commit and is being recomputed.
    case loaded(Value, stale: Bool)
    case failed(String)

    public var value: Value? {
        if case .loaded(let value, _) = self { return value }
        return nil
    }
}
