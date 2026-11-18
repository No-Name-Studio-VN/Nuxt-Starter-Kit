import Foundation

public struct SwitcherCandidate: Sendable, Equatable, Identifiable {
    public let id: UUID
    public let name: String
    public let path: String

    public init(id: UUID, name: String, path: String) {
        self.id = id
        self.name = name
        self.path = path
    }
}
