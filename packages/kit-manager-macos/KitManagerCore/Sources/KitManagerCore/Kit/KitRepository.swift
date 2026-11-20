import Foundation

/// Reads the kit checkout's history through git: latest main, version labels, commits behind
/// and the module-aware changelog. Every call goes through the injected runner as
/// `git --no-optional-locks -C <root> …`.
///
/// `availability` and `versionLabel` never throw: a commit the clone cannot serve is an
/// expected state (spec 2.2), not an error.
public struct KitRepository: Sendable {
    private static let kitConfigPath = "packages/create-nuxt-saas/kit.json"
    private static let mainRef = "origin/main"

    private let root: URL
    private let runner: any ProcessRunning

    public init(root: URL, runner: any ProcessRunning) {
        self.root = root
        self.runner = runner
    }

    public func fetch() async throws {
        try await git(["fetch", "origin", "--tags"], timeout: .seconds(120))
    }

    public func latestMain() async throws -> String {
        try await text(["rev-parse", "--verify", Self.mainRef])
    }

    public func availability(of sha: String) async -> CommitAvailability {
        guard isPlainRevision(sha) else { return .notOnMain }
        guard (try? await git(["cat-file", "-e", "\(sha)^{commit}"])) != nil,
            (try? await git(["merge-base", "--is-ancestor", sha, Self.mainRef])) != nil
        else { return .notOnMain }
        return .onMain
    }

    public func versionLabel(for sha: String) async -> String? {
        guard isPlainRevision(sha),
            let output = try? await text(["describe", "--tags", "--match", "v*", sha])
        else { return nil }
        return Self.parseDescribe(output)
    }

    public func commitsBehind(_ sha: String) async throws -> Int {
        try requirePlainRevision(sha)
        let arguments = ["rev-list", "--count", "\(sha)..\(Self.mainRef)"]
        let output = try await text(arguments)
        guard let count = Int(output) else {
            throw GitError.commandFailed(arguments: arguments, exitCode: 0, stderr: "Unexpected output: \(output)")
        }
        return count
    }

    public func kitConfig(at ref: String) async throws -> KitConfig {
        try requirePlainRevision(ref)
        let output = try await git(["show", "\(ref):\(Self.kitConfigPath)"]).stdout
        return try JSONDecoder().decode(KitConfig.self, from: output)
    }

    /// Commits in `sha..origin/main`, newest first, each mapped to the modules it touched.
    public func commits(from sha: String, mapping: ModuleMapping) async throws -> [KitCommit] {
        try requirePlainRevision(sha)
        // Records start with U+001E; fields are separated by U+001F. With `-z`, the subject is
        // followed by a NUL and then the NUL-separated paths, so quoted or unicode paths survive.
        let output = try await git([
            "log", "--name-only", "-z", "--format=%x1e%H%x1f%cI%x1f%s", "\(sha)..\(Self.mainRef)",
        ]).stdout
        return String(decoding: output, as: UTF8.self)
            .split(separator: "\u{1e}")
            .compactMap { Self.parseRecord(String($0), mapping: mapping) }
    }

    /// Version tags (`v` and a digit, then anything) that point at a commit of `sha..origin/main`, by commit SHA. One
    /// `git log` pass with decorations, so it stays cheap on a long history.
    public func releaseTags(from sha: String) async throws -> [String: [String]] {
        try requirePlainRevision(sha)
        let output = try await text([
            "log", "--decorate-refs=refs/tags/v[0-9]*", "--format=%H%x1f%D", "\(sha)..\(Self.mainRef)",
        ])
        var tags: [String: [String]] = [:]
        for line in output.split(separator: "\n") {
            let fields = line.split(separator: "\u{1f}", maxSplits: 1, omittingEmptySubsequences: false)
            guard fields.count == 2 else { continue }
            // `v1.2.3`: a "v" and a digit, so a tag such as `vendor-x` is not a release.
            let names = fields[1].split(separator: ", ").compactMap { reference -> String? in
                guard let match = reference.wholeMatch(of: /tag: (v\d\S*)/) else { return nil }
                return String(match.1)
            }
            if !names.isEmpty { tags[String(fields[0])] = names }
        }
        return tags
    }

    /// `commits(from:mapping:)` bucketed under release tags, for the kit changelog page.
    public func changelog(from sha: String, mapping: ModuleMapping) async throws -> [ReleaseSection] {
        async let commits = commits(from: sha, mapping: mapping)
        async let tags = releaseTags(from: sha)
        return ReleaseGrouper.sections(commits: try await commits, tags: try await tags)
    }

    /// Compares commits, or a single commit against its first parent. `nil` paths means all files;
    /// an empty list means none. Only complete file patches within the byte limit are returned.
    public func diff(from base: String?, to head: String, limitedTo paths: [String]?, maxBytes: Int) async throws -> KitDiff {
        try requirePlainRevision(head)
        if let base { try requirePlainRevision(base) }
        if paths?.isEmpty == true { return KitDiff(text: "", files: [], isTruncated: false) }
        let revisions = try await diffRevisions(from: base, to: head)
        let output = try await git(
            ["--no-lazy-fetch", "--literal-pathspecs", "-c", "core.quotePath=false"]
                + Self.diffArguments + ["-M", "--raw", "-z", "--patch", "--src-prefix=a/", "--dst-prefix=b/"]
                + revisions + ["--"] + (paths ?? [])).stdout
        return KitDiff.preview(of: output, maxBytes: maxBytes)
    }

    /// Returns nil when the project file has no exact changed path in the kit.
    public func focusedDiff(from base: String?, to head: String, path: String, maxBytes: Int) async throws -> KitDiff? {
        guard !path.isEmpty, try await changedPaths(from: base, to: head).contains(path) else { return nil }
        return try await diff(from: base, to: head, limitedTo: [path], maxBytes: maxBytes)
    }

    /// Includes both sides of renames so module scoping can match either the source or destination.
    public func changedPaths(from base: String?, to head: String) async throws -> [String] {
        try requirePlainRevision(head)
        if let base { try requirePlainRevision(base) }
        let revisions = try await diffRevisions(from: base, to: head)
        let output = try await git(
            ["--no-lazy-fetch"] + Self.diffArguments + ["--no-renames", "--name-only", "-z"] + revisions + ["--"]).stdout
        return output.split(separator: 0).map { String(decoding: $0, as: UTF8.self) }
    }

    /// `v3.0.1` for an exact tag, `v3.0.1 +4` for four commits past it; nil when unrecognised.
    public static func parseDescribe(_ output: String) -> String? {
        let trimmed = output.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let match = trimmed.wholeMatch(of: /(v\S*?)(?:-(\d+)-g[0-9a-f]+)?/) else { return nil }
        guard let ahead = match.2 else { return String(match.1) }
        return "\(match.1) +\(ahead)"
    }

    /// Splits `type(scope)!: subject`. A subject that is not conventional yields no type or scope.
    public static func parseConventional(_ subject: String) -> (type: String?, scope: String?, breaking: Bool) {
        guard let match = subject.prefixMatch(of: /(\w+)(?:\(([^)]*)\))?(!)?:\s/) else {
            return (nil, nil, false)
        }
        let scope = match.2.map(String.init)
        return (String(match.1), scope?.isEmpty == true ? nil : scope, match.3 != nil)
    }

    // MARK: - Helpers

    private static let diffArguments = [
        "diff", "--no-color", "--no-ext-diff", "--no-textconv", "--no-relative", "--ignore-submodules=none", "--submodule=short",
    ]

    private func diffRevisions(from base: String?, to head: String) async throws -> [String] {
        let target = "\(head)^{commit}"
        if let base { return ["\(base)^{commit}", target] }
        // Read the real parent header, so a shallow boundary is not mistaken for a root commit.
        let commit = try await text(["--no-lazy-fetch", "cat-file", "commit", target])
        if let parent = commit.split(separator: "\n", omittingEmptySubsequences: false)
            .prefix(while: { !$0.isEmpty }).first(where: { $0.hasPrefix("parent ") })
        {
            let revision = String(parent.dropFirst("parent ".count))
            try requirePlainRevision(revision)
            return [revision, target]
        }
        // Hash empty stdin instead of assuming the kit uses SHA-1 object IDs.
        let emptyTree = try await text(["--no-lazy-fetch", "hash-object", "-t", "tree", "--stdin"])
        return [emptyTree, target]
    }

    private static func parseRecord(_ record: String, mapping: ModuleMapping) -> KitCommit? {
        let parts = record.split(separator: "\0", omittingEmptySubsequences: false)
        guard let header = parts.first else { return nil }
        let fields = header.split(separator: "\u{1f}", maxSplits: 2, omittingEmptySubsequences: false)
        guard fields.count == 3 else { return nil }

        // `--name-only` puts a newline between the header and the first path.
        var paths = parts.dropFirst().map(String.init)
        if let first = paths.first, first.hasPrefix("\n") {
            paths[0] = String(first.dropFirst())
        }
        paths.removeAll(where: \.isEmpty)

        let subject = String(fields[2])
        let conventional = parseConventional(subject)
        return KitCommit(
            id: String(fields[0]), subject: subject, type: conventional.type, scope: conventional.scope,
            breaking: conventional.breaking,
            date: (try? Date(String(fields[1]), strategy: .iso8601)) ?? Date(timeIntervalSince1970: 0),
            modules: mapping.modules(for: paths))
    }

    /// A leading dash would be read as an option.
    private func isPlainRevision(_ revision: String) -> Bool {
        !revision.isEmpty && !revision.hasPrefix("-")
    }

    private func requirePlainRevision(_ revision: String) throws {
        guard isPlainRevision(revision) else { throw GitError.invalidRevision(revision) }
    }

    private func text(_ arguments: [String]) async throws -> String {
        let output = try await git(arguments).stdout
        return String(decoding: output, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    @discardableResult
    private func git(_ arguments: [String], timeout: Duration = .seconds(30)) async throws -> ProcessResult {
        let full = ["--no-optional-locks", "-C", root.path] + arguments
        let result = try await runner.run("git", full, in: nil, timeout: timeout)
        guard result.exitCode == 0 else {
            throw GitError.commandFailed(
                arguments: arguments, exitCode: result.exitCode,
                stderr: String(decoding: result.stderr, as: UTF8.self))
        }
        return result
    }
}
