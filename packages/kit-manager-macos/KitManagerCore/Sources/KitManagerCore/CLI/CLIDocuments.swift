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
    public let unsaved: UnsavedWork?
    public let backup: Backup?
    public let notes: [NoteReport]?
    public let suggestions: [Suggestion]?
    public let report: String?

    public init(
        schema: Int, from: String, to: String, changes: [FileChangeSummary], conflicts: [String],
        followUps: [String], addedModules: [String], removedModules: [String], applied: Bool,
        upToDate: Bool?, unsaved: UnsavedWork? = nil, backup: Backup? = nil, notes: [NoteReport]? = nil,
        suggestions: [Suggestion]? = nil, report: String? = nil
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
        self.unsaved = unsaved
        self.backup = backup
        self.notes = notes
        self.suggestions = suggestions
        self.report = report
    }
}

public enum DecisionKind: String, Codable, Sendable {
    case conflict
    case keepEdited = "keep-edited"
}

public struct RiskyFile: Codable, Sendable, Hashable {
    public let path: String
    public let kind: DecisionKind

    public init(path: String, kind: DecisionKind) {
        self.path = path
        self.kind = kind
    }
}

public struct UnsavedWork: Codable, Sendable, Equatable {
    public let total: Int
    public let risky: [RiskyFile]
    public let touched: [String]
    public let untouched: Int

    public init(total: Int, risky: [RiskyFile], touched: [String], untouched: Int) {
        self.total = total
        self.risky = risky
        self.touched = touched
        self.untouched = untouched
    }
}

public enum BackupStatus: String, Codable, Sendable {
    case pending
    case complete
    case failed
    case restored
}

public struct Backup: Codable, Sendable, Equatable {
    public let ref: String
    public let name: String
    private let created: CLITimestamp
    private let expires: CLITimestamp
    public let status: BackupStatus

    public var createdAt: Date { created.date }
    public var expiresAt: Date { expires.date }

    private enum CodingKeys: String, CodingKey {
        case ref, name, status
        case created = "createdAt"
        case expires = "expiresAt"
    }

    public init(ref: String, name: String, createdAt: Date, expiresAt: Date, status: BackupStatus) {
        self.ref = ref
        self.name = name
        self.created = CLITimestamp(createdAt)
        self.expires = CLITimestamp(expiresAt)
        self.status = status
    }
}

public enum UndoBlockReason: String, Codable, Sendable {
    case noBackup = "no-backup"
    case movedHead = "moved-head"
    case changes
    case pending
}

public struct UndoBlocked: Codable, Sendable, Equatable {
    public let reason: UndoBlockReason
    public let message: String
    public let paths: [String]

    public init(reason: UndoBlockReason, message: String, paths: [String]) {
        self.reason = reason
        self.message = message
        self.paths = paths
    }
}

public struct UndoReport: Codable, Sendable, Equatable {
    public let schema: Int
    public let backup: Backup?
    public let restorable: Bool
    public let blocked: UndoBlocked?
    public let restored: Bool
    public let files: Int

    public init(schema: Int, backup: Backup?, restorable: Bool, blocked: UndoBlocked?, restored: Bool, files: Int) {
        self.schema = schema
        self.backup = backup
        self.restorable = restorable
        self.blocked = blocked
        self.restored = restored
        self.files = files
    }
}

public struct BackupList: Codable, Sendable, Equatable {
    public let schema: Int
    public let backups: [Backup]

    public init(schema: Int, backups: [Backup]) {
        self.schema = schema
        self.backups = backups
    }
}

public enum ChangeNoteKind: String, Codable, Sendable {
    case feature
    case fix
    case security
}

public struct ChangeNote: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let module: String
    public let title: String
    public let kind: ChangeNoteKind
    public let since: String
    public let files: [String]

    public init(id: String, module: String, title: String, kind: ChangeNoteKind, since: String, files: [String]) {
        self.id = id
        self.module = module
        self.title = title
        self.kind = kind
        self.since = since
        self.files = files
    }
}

public enum NoteOutcome: String, Codable, Sendable {
    case applied
    case kept
    case conflict
    case declined
}

public struct NoteReport: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let module: String
    public let title: String
    public let kind: ChangeNoteKind
    public let since: String
    public let files: [String]
    public let outcome: NoteOutcome
    public let affected: [String]

    public init(
        id: String, module: String, title: String, kind: ChangeNoteKind, since: String, files: [String],
        outcome: NoteOutcome, affected: [String]
    ) {
        self.id = id
        self.module = module
        self.title = title
        self.kind = kind
        self.since = since
        self.files = files
        self.outcome = outcome
        self.affected = affected
    }
}

public enum SuggestionAction: String, Codable, Sendable {
    case takeKit = "take-kit"
    case combine
    case keepMine = "keep-mine"
    case byHand = "by-hand"
}

public struct Suggestion: Codable, Sendable, Hashable {
    public let path: String
    public let action: SuggestionAction
    public let reason: String
    public let notes: [String]

    public init(path: String, action: SuggestionAction, reason: String, notes: [String]) {
        self.path = path
        self.action = action
        self.reason = reason
        self.notes = notes
    }
}

public enum ResolutionAction: String, Codable, Sendable {
    case keepMine = "keep-mine"
    case takeKit = "take-kit"
    case combine
}

public struct Decision: Codable, Sendable, Hashable, Identifiable {
    public let path: String
    public let kind: DecisionKind
    public let pending: Bool
    public let suggestion: Suggestion?
    public let notes: [ChangeNote]
    public let resolution: ResolutionAction?
    public let hasKitVersion: Bool

    public var id: String { path }

    public init(
        path: String, kind: DecisionKind, pending: Bool, suggestion: Suggestion?, notes: [ChangeNote],
        resolution: ResolutionAction?, hasKitVersion: Bool
    ) {
        self.path = path
        self.kind = kind
        self.pending = pending
        self.suggestion = suggestion
        self.notes = notes
        self.resolution = resolution
        self.hasKitVersion = hasKitVersion
    }
}

public struct ResolvedDecision: Codable, Sendable, Equatable {
    public let path: String
    public let action: ResolutionAction

    public init(path: String, action: ResolutionAction) {
        self.path = path
        self.action = action
    }
}

public struct DecisionsReport: Codable, Sendable, Equatable {
    public let schema: Int
    public let decisions: [Decision]
    public let resolved: ResolvedDecision?

    public init(schema: Int, decisions: [Decision], resolved: ResolvedDecision? = nil) {
        self.schema = schema
        self.decisions = decisions
        self.resolved = resolved
    }
}

public struct DeclineReport: Codable, Sendable, Equatable {
    public let schema: Int
    public let declined: [String]

    public init(schema: Int, declined: [String]) {
        self.schema = schema
        self.declined = declined
    }
}

public enum TransitionCommand: String, Codable, Sendable {
    case upgrade
    case add
    case remove
}

public struct ReportResolution: Codable, Sendable, Equatable {
    public let path: String
    public let action: ResolutionAction
    private let time: CLITimestamp

    public var at: Date { time.date }

    private enum CodingKeys: String, CodingKey {
        case path, action
        case time = "at"
    }

    public init(path: String, action: ResolutionAction, at: Date) {
        self.path = path
        self.action = action
        self.time = CLITimestamp(at)
    }
}

/// The CLI writes the transition and its metadata at the same level in `upgrade-report.json`.
public struct SavedReport: Codable, Sendable, Equatable {
    public let transition: TransitionReport
    public let command: TransitionCommand
    public let createdAt: Date
    public let fromVersion: String?
    public let toVersion: String?
    public let resolutions: [ReportResolution]

    public init(
        transition: TransitionReport, command: TransitionCommand, createdAt: Date, fromVersion: String?,
        toVersion: String?, resolutions: [ReportResolution]
    ) {
        self.transition = transition
        self.command = command
        self.createdAt = createdAt
        self.fromVersion = fromVersion
        self.toVersion = toVersion
        self.resolutions = resolutions
    }

    private enum CodingKeys: String, CodingKey {
        case command, createdAt, fromVersion, toVersion, resolutions
    }

    public init(from decoder: Decoder) throws {
        transition = try TransitionReport(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        command = try container.decode(TransitionCommand.self, forKey: .command)
        createdAt = try container.decode(CLITimestamp.self, forKey: .createdAt).date
        fromVersion = try container.decodeIfPresent(String.self, forKey: .fromVersion)
        toVersion = try container.decodeIfPresent(String.self, forKey: .toVersion)
        resolutions = try container.decode([ReportResolution].self, forKey: .resolutions)
    }

    public func encode(to encoder: Encoder) throws {
        try transition.encode(to: encoder)
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(command, forKey: .command)
        try container.encode(CLITimestamp(createdAt), forKey: .createdAt)
        try container.encode(fromVersion, forKey: .fromVersion)
        try container.encode(toVersion, forKey: .toVersion)
        try container.encode(resolutions, forKey: .resolutions)
    }

    public static func read(_ project: URL) -> SavedReport? {
        let url = project.appending(path: ".nuxt-saas/upgrade-report.json")
        guard let data = try? Data(contentsOf: url), let report = try? JSONDecoder().decode(Self.self, from: data),
            report.transition.schema == NuxtSaasCLI.supportedSchema
        else { return nil }
        return report
    }
}

/// Keep the CLI's string representation when reports are encoded into the app cache, too.
private struct CLITimestamp: Codable, Sendable, Equatable {
    let date: Date

    init(_ date: Date) {
        self.date = date
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let value = try container.decode(String.self)
        let format = ISO8601DateFormatter()
        format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let parsed = format.date(from: value) {
            date = parsed
        } else {
            format.formatOptions = [.withInternetDateTime]
            guard let parsed = format.date(from: value) else {
                throw DecodingError.dataCorruptedError(in: container, debugDescription: "Expected an ISO-8601 date.")
            }
            date = parsed
        }
    }

    func encode(to encoder: Encoder) throws {
        let format = ISO8601DateFormatter()
        format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        var container = encoder.singleValueContainer()
        try container.encode(format.string(from: date))
    }
}

public struct KitModuleChange: Codable, Sendable, Hashable, Identifiable {
    public let id: String
    public let since: String
    public let title: String
    public let kind: ChangeNoteKind?
    public let files: [String]

    public init(id: String, since: String, title: String, kind: ChangeNoteKind? = nil, files: [String]) {
        self.id = id
        self.since = since
        self.title = title
        self.kind = kind
        self.files = files
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
    public let changes: [KitModuleChange]?

    public init(
        id: String, title: String, description: String, requires: [String], internal: Bool,
        dependencies: [String], devDependencies: [String], scripts: [String], env: [String],
        bindings: [String], rootFiles: [String], changes: [KitModuleChange]? = nil
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
        self.changes = changes
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

public struct InspectFeatures: Codable, Sendable, Equatable {
    public let missing: [NoteReport]
    public let declined: [String]

    public init(missing: [NoteReport], declined: [String]) {
        self.missing = missing
        self.declined = declined
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
    public let features: InspectFeatures?

    public init(
        schema: Int, commit: String, kit: String, modules: [String], identity: KitIdentity,
        conflicts: InspectConflicts, files: [InspectFile], summary: InspectSummary, features: InspectFeatures? = nil
    ) {
        self.schema = schema
        self.commit = commit
        self.kit = kit
        self.modules = modules
        self.identity = identity
        self.conflicts = conflicts
        self.files = files
        self.summary = summary
        self.features = features
    }
}
