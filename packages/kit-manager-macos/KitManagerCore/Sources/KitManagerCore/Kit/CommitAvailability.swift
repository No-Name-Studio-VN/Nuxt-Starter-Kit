import Foundation

public enum CommitAvailability: Sendable, Equatable {
    /// The commit exists locally and is an ancestor of `origin/main`.
    case onMain
    /// Missing from the clone, or on a branch that never reached `origin/main`.
    case notOnMain
}
