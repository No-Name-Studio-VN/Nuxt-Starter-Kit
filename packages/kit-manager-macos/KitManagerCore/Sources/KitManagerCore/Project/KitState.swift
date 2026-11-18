import Foundation

/// The contents of a project's `.nuxt-saas.json`, as written by the nuxt-saas CLI.
public struct KitState: Codable, Sendable, Hashable {
    public let version: Int
    public let kit: String
    public let commit: String
    public let modules: [String]
    public let identity: KitIdentity
    public let conflicts: [String]

    public init(
        version: Int, kit: String, commit: String, modules: [String], identity: KitIdentity,
        conflicts: [String]
    ) {
        self.version = version
        self.kit = kit
        self.commit = commit
        self.modules = modules
        self.identity = identity
        self.conflicts = conflicts
    }
}
