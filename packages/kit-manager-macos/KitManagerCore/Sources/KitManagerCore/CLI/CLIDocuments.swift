import Foundation

// Codable mirrors of the JSON documents in packages/create-nuxt-saas/src/types/json.ts
// and src/commands/inspect.ts. Property names match the CLI output exactly.

public enum ChangeKind: String, Codable, Sendable {
    case create
    case update
    case merge
    case conflict
    case delete
    case keepEdited = "keep-edited"
    case keepProtected = "keep-protected"
}

public struct FileChangeSummary: Codable, Sendable, Hashable {
    public let path: String
    public let kind: ChangeKind

    public init(path: String, kind: ChangeKind) {
        self.path = path
        self.kind = kind
    }
}

public struct TransitionReport: Codable, Sendable, Equatable {
    public let schema: Int
    public let from: String
    public let to: String
    public let changes: [FileChangeSummary]
    public let conflicts: [String]
    public let followUps: [String]
    public let addedModules: [String]
    public let removedModules: [String]
    public let applied: Bool
    public let upToDate: Bool?

    public init(
        schema: Int, from: String, to: String, changes: [FileChangeSummary], conflicts: [String],
        followUps: [String], addedModules: [String], removedModules: [String], applied: Bool,
        upToDate: Bool?
    ) {
        self.schema = schema
        self.from = from
        self.to = to
        self.changes = changes
        self.conflicts = conflicts
        self.followUps = followUps
        self.addedModules = addedModules
        self.removedModules = removedModules
        self.applied = applied
        self.upToDate = upToDate
    }
}

public struct KitModuleInfo: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let title: String
    public let description: String
    public let requires: [String]
    public let `internal`: Bool
    public let dependencies: [String]
    public let devDependencies: [String]
    public let scripts: [String]
    public let env: [String]
    public let bindings: [String]
    public let rootFiles: [String]

    public init(
        id: String, title: String, description: String, requires: [String], internal: Bool,
        dependencies: [String], devDependencies: [String], scripts: [String], env: [String],
        bindings: [String], rootFiles: [String]
    ) {
        self.id = id
        self.title = title
        self.description = description
        self.requires = requires
        self.internal = `internal`
        self.dependencies = dependencies
        self.devDependencies = devDependencies
        self.scripts = scripts
        self.env = env
        self.bindings = bindings
        self.rootFiles = rootFiles
    }
}

public struct ModulesReport: Codable, Sendable, Equatable {
    public let schema: Int
    public let commit: String
    public let modules: [KitModuleInfo]
    public let installed: [String]

    public init(schema: Int, commit: String, modules: [KitModuleInfo], installed: [String]) {
        self.schema = schema
        self.commit = commit
        self.modules = modules
        self.installed = installed
    }
}

public enum InspectStatus: String, Codable, Sendable {
    case unchanged
    case edited
    case deleted
    case protected
}

public struct InspectFile: Codable, Sendable, Hashable {
    public let path: String
    public let status: InspectStatus
    public let layer: String
    public let expected: Bool

    public init(path: String, status: InspectStatus, layer: String, expected: Bool) {
        self.path = path
        self.status = status
        self.layer = layer
        self.expected = expected
    }
}

public struct KitIdentity: Codable, Sendable, Hashable {
    public let name: String
    public let description: String

    public init(name: String, description: String) {
        self.name = name
        self.description = description
    }
}

public struct InspectConflicts: Codable, Sendable, Equatable {
    public let recorded: [String]
    public let unresolved: [String]

    public init(recorded: [String], unresolved: [String]) {
        self.recorded = recorded
        self.unresolved = unresolved
    }
}

public struct InspectSummary: Codable, Sendable, Equatable {
    public let total: Int
    public let unchanged: Int
    public let edited: Int
    public let deleted: Int
    public let protected: Int
    public let expected: Int
    public let scored: Int
    public let scoredChanged: Int

    public init(
        total: Int, unchanged: Int, edited: Int, deleted: Int, protected: Int, expected: Int,
        scored: Int, scoredChanged: Int
    ) {
        self.total = total
        self.unchanged = unchanged
        self.edited = edited
        self.deleted = deleted
        self.protected = protected
        self.expected = expected
        self.scored = scored
        self.scoredChanged = scoredChanged
    }

    /// Share of scored files the user has edited or deleted; 0 when nothing is scored.
    public var score: Double {
        scored == 0 ? 0 : Double(scoredChanged) / Double(scored)
    }
}

public struct InspectReport: Codable, Sendable, Equatable {
    public let schema: Int
    public let commit: String
    public let kit: String
    public let modules: [String]
    public let identity: KitIdentity
    public let conflicts: InspectConflicts
    public let files: [InspectFile]
    public let summary: InspectSummary

    public init(
        schema: Int, commit: String, kit: String, modules: [String], identity: KitIdentity,
        conflicts: InspectConflicts, files: [InspectFile], summary: InspectSummary
    ) {
        self.schema = schema
        self.commit = commit
        self.kit = kit
        self.modules = modules
        self.identity = identity
        self.conflicts = conflicts
        self.files = files
        self.summary = summary
    }
}
