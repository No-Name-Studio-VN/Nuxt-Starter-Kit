import Foundation

public struct KitCommit: Sendable, Hashable, Identifiable {
    /// The commit SHA.
    public let id: String
    public let subject: String
    public let type: String?
    public let scope: String?
    public let breaking: Bool
    public let date: Date
    /// Module IDs the commit touched; `base` for shared files. Empty when nothing shipped.
    public let modules: Set<String>

    public init(
        id: String, subject: String, type: String?, scope: String?, breaking: Bool, date: Date,
        modules: Set<String>
    ) {
        self.id = id
        self.subject = subject
        self.type = type
        self.scope = scope
        self.breaking = breaking
        self.date = date
        self.modules = modules
    }

    /// The subject without its `type(scope): ` prefix, when it has one.
    public var title: String {
        guard type != nil, let colon = subject.firstRange(of: ": ") else { return subject }
        let rest = subject[colon.upperBound...].trimmingCharacters(in: .whitespaces)
        return rest.isEmpty ? subject : rest
    }

    /// A commit matters to a project when it touches the base or any installed module.
    public func isRelevant(to installed: Set<String>) -> Bool {
        modules.contains(ModuleMapping.base) || !modules.isDisjoint(with: installed)
    }
}
