import Foundation

public enum KitSourceMode: Sendable {
    /// Render from the local kit checkout, including uncommitted changes.
    case local
    /// Use the kit commit recorded in the project.
    case recorded
}

public enum ModuleAction: String, Sendable {
    case add
    case remove
}

/// Typed wrapper around `packages/create-nuxt-saas/bin/nuxt-saas.mjs` in a kit checkout.
public struct NuxtSaasCLI: Sendable {
    public static let minimumVersion = "3.1.0"

    private static let supportedSchema = 1
    private static let commandTimeout = Duration.seconds(120)
    private static let buildTimeout = Duration.seconds(300)

    private let kitRoot: URL
    private let runner: any ProcessRunning

    public init(kitRoot: URL, runner: any ProcessRunning) {
        self.kitRoot = kitRoot
        self.runner = runner
    }

    private var cliDirectory: URL {
        kitRoot.appending(path: "packages/create-nuxt-saas")
    }

    private var scriptPath: String {
        cliDirectory.appending(path: "bin/nuxt-saas.mjs").path
    }

    // MARK: Status

    public func status() -> CLIStatus {
        let fileManager = FileManager.default
        guard let found = packageVersion() else { return .missingCheckout }
        guard Self.isVersion(found, atLeast: Self.minimumVersion) else { return .tooOld(found: found) }
        guard let builtAt = modificationDate(of: cliDirectory.appending(path: "dist/cli.mjs")) else {
            return .missingBuild
        }
        let sources = cliDirectory.appending(path: "src")
        if let enumerator = fileManager.enumerator(at: sources, includingPropertiesForKeys: [.contentModificationDateKey]) {
            for case let url as URL in enumerator where url.pathExtension == "ts" {
                if let modifiedAt = modificationDate(of: url), modifiedAt > builtAt {
                    return .staleBuild
                }
            }
        }
        return .ready
    }

    public func build() async throws {
        let result = try await runner.run(
            "pnpm", ["--dir", "packages/create-nuxt-saas", "build"], in: kitRoot, timeout: Self.buildTimeout)
        guard result.exitCode == 0 else {
            throw CLIFailure.unparsable(stderr: Self.text(result.stderr), exitCode: result.exitCode)
        }
    }

    // MARK: Commands

    public func modules(at commit: String) async throws -> ModulesReport {
        // An empty directory makes the CLI behave as if run outside a project.
        let emptyDirectory = FileManager.default.temporaryDirectory
            .appending(path: "kit-manager-modules-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: emptyDirectory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: emptyDirectory) }
        let arguments = ["modules", "--json", "--dir", emptyDirectory.path] + localKitArguments + ["--to", commit]
        return try await execute(arguments, as: ModulesReport.self)
    }

    public func inspect(project: URL, source: KitSourceMode) async throws -> InspectReport {
        let arguments = ["inspect", "--json", "--dir", project.path] + kitArguments(for: source)
        return try await execute(arguments, as: InspectReport.self)
    }

    public func upgrade(project: URL, to commit: String?, source: KitSourceMode, check: Bool) async throws -> TransitionReport {
        if source == .local && commit == nil {
            throw CLIFailure.reported(message: "A local upgrade needs a target commit.", kind: "expected")
        }
        var arguments = ["upgrade", "--json", "--dir", project.path] + kitArguments(for: source)
        if let commit { arguments += ["--to", commit] }
        if check { arguments.append("--check") }
        return try await execute(arguments, as: TransitionReport.self)
    }

    public func changeModules(_ action: ModuleAction, ids: [String], project: URL, check: Bool) async throws -> TransitionReport {
        var arguments = [action.rawValue, ids.joined(separator: ","), "--json", "--dir", project.path] + localKitArguments
        if check { arguments.append("--check") }
        return try await execute(arguments, as: TransitionReport.self)
    }

    // MARK: Execution

    private var localKitArguments: [String] {
        ["--kit", kitRoot.path, "--allow-dirty-kit"]
    }

    private func kitArguments(for source: KitSourceMode) -> [String] {
        switch source {
        case .local: localKitArguments
        case .recorded: []
        }
    }

    private func execute<Report: Decodable>(_ arguments: [String], as type: Report.Type) async throws -> Report {
        let current = status()
        guard current == .ready else { throw CLIFailure.unavailable(current) }
        let result = try await runner.run("node", [scriptPath] + arguments, in: nil, timeout: Self.commandTimeout)
        return try Self.decode(result, as: type)
    }

    private struct Envelope: Decodable {
        struct Failure: Decodable {
            let message: String
            let kind: String
        }

        let schema: Int
        let error: Failure?
    }

    /// Exit code 1 is not itself a failure: a conflicted upgrade exits 1 with a normal report.
    static func decode<Report: Decodable>(_ result: ProcessResult, as type: Report.Type) throws -> Report {
        let decoder = JSONDecoder()
        let stderr = text(result.stderr)
        let envelope: Envelope
        do {
            envelope = try decoder.decode(Envelope.self, from: result.stdout)
        } catch {
            throw CLIFailure.unparsable(stderr: stderr, exitCode: result.exitCode)
        }
        guard envelope.schema == supportedSchema else { throw CLIFailure.unsupportedSchema(envelope.schema) }
        if let failure = envelope.error {
            throw CLIFailure.reported(message: failure.message, kind: failure.kind)
        }
        do {
            return try decoder.decode(Report.self, from: result.stdout)
        } catch {
            let detail = stderr.isEmpty ? String(describing: error) : stderr
            throw CLIFailure.unparsable(stderr: detail, exitCode: result.exitCode)
        }
    }

    private static func text(_ data: Data) -> String {
        String(decoding: data, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    // MARK: Status helpers

    private struct PackageManifest: Decodable {
        let version: String
    }

    private func packageVersion() -> String? {
        guard let data = try? Data(contentsOf: cliDirectory.appending(path: "package.json")) else { return nil }
        return try? JSONDecoder().decode(PackageManifest.self, from: data).version
    }

    private func modificationDate(of url: URL) -> Date? {
        try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
    }

    /// Compares dotted versions per numeric component, so 3.10.0 is newer than 3.9.0.
    /// A pre-release or build suffix on a component is ignored; an unreadable version counts as too old.
    static func isVersion(_ version: String, atLeast minimum: String) -> Bool {
        guard let found = components(of: version), let required = components(of: minimum) else { return false }
        for index in 0..<max(found.count, required.count) {
            let lhs = index < found.count ? found[index] : 0
            let rhs = index < required.count ? required[index] : 0
            if lhs != rhs { return lhs > rhs }
        }
        return true
    }

    private static func components(of version: String) -> [Int]? {
        let parts = version.split(separator: ".", omittingEmptySubsequences: false)
            .map { Int($0.prefix { $0.isNumber }) }
        var numbers: [Int] = []
        for part in parts {
            guard let number = part else { return nil }
            numbers.append(number)
        }
        return numbers.isEmpty ? nil : numbers
    }
}
