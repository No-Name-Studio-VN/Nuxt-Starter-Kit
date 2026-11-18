import Foundation

/// A suggested action for a project.
public struct NextStep: Sendable, Equatable, Identifiable {
    public enum Kind: Sendable, Equatable {
        case fixConflicts(Int), update, migrate(others: Int), missingEnvKeys(Int), siteDown
    }

    public let projectID: UUID
    public let kind: Kind
    public var id: UUID { projectID }
}
