import Foundation

/// The contents of a project's `.nuxt-saas.json`, as written by the nuxt-saas CLI.
public struct KitState: Codable, Sendable, Hashable {
    public let version: Int
    public let kit: String
    public let commit: String
    public let modules: [String]
    public let identity: KitIdentity
    public let conflicts: [String]
    public let declined: [String]?

    public init(
        version: Int, kit: String, commit: String, modules: [String], identity: KitIdentity,
        conflicts: [String], declined: [String]? = nil
    ) {
        self.version = version
        self.kit = kit
        self.commit = commit
        self.modules = modules
        self.identity = identity
        self.conflicts = conflicts
        self.declined = declined
    }
}

extension KitState {
    /// The recorded template the kit author ships; only these two spellings count as the default.
    /// A fork that tracks `#main` is a different template.
    public static let defaultTemplate = "github:No-Name-Studio-VN/Nuxt-Starter-Kit"

    public var usesDefaultTemplate: Bool {
        kit == Self.defaultTemplate || kit == "\(Self.defaultTemplate)#main"
    }

    /// The part after `#`, when there is one.
    public var templateRef: String? {
        guard let hash = kit.firstIndex(of: "#") else { return nil }
        let ref = String(kit[kit.index(after: hash)...])
        return ref.isEmpty ? nil : ref
    }

    /// True for the kit's own repository, whatever ref is recorded.
    public var isDefaultRepository: Bool {
        kit.split(separator: "#", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init)
            == Self.defaultTemplate
    }

    /// The tag or branch a project on the kit's own repository is pinned to; nil for `main`, no ref,
    /// or another repository.
    public var pinnedRef: String? {
        guard isDefaultRepository, let ref = templateRef, ref != "main" else { return nil }
        return ref
    }
}
