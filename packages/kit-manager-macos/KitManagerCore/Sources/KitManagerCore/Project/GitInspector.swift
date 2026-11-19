import CryptoKit
import Foundation

/// Read-only repository inspection plus the few branch operations the upgrade flow needs.
/// Every call goes through the injected runner as `git --no-optional-locks -C <root> …`.
///
/// A folder that is not a git repository makes `status` and `fingerprint` throw
/// `GitError.commandFailed` carrying git's own message.
public struct GitInspector: Sendable {
    private let runner: any ProcessRunning
    private let timeout: Duration = .seconds(30)

    public init(runner: any ProcessRunning) {
        self.runner = runner
    }

    public func status(_ root: URL) async throws -> GitStatus {
        let porcelain = PorcelainV2(try await git(root, ["status", "--porcelain=v2", "--branch", "-z"]).stdout)
        return GitStatus(
            head: porcelain.oid,
            branch: porcelain.branch,
            dirtyCount: porcelain.paths.count,
            ahead: porcelain.ahead,
            behind: porcelain.behind,
            lastCommitDate: await lastCommitDate(root)
        )
    }

    /// The fetch URL of `origin`, or of the only configured remote when there is no `origin`.
    public func remoteURL(_ root: URL) async -> String? {
        guard let listing = try? await git(root, ["remote"]) else { return nil }
        let names = String(decoding: listing.stdout, as: UTF8.self).split(whereSeparator: \.isNewline)
        let name = names.contains("origin") ? "origin" : (names.count == 1 ? names.first : nil)
        guard let name, let result = try? await git(root, ["remote", "get-url", "--", String(name)])
        else { return nil }
        let url = String(decoding: result.stdout, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        return url.isEmpty ? nil : url
    }

    /// SHA-256 hex over HEAD, the porcelain status, and the size and mtime of every dirty or
    /// untracked path, so editing an already-dirty file again changes the result (spec 2.3).
    /// A repository without commits hashes an empty HEAD.
    public func fingerprint(_ root: URL) async throws -> String {
        let headResult = try? await runner.run(
            "git", ["--no-optional-locks", "-C", root.path, "rev-parse", "--verify", "--quiet", "HEAD"],
            in: nil, timeout: timeout)
        let head = headResult.flatMap { $0.exitCode == 0 ? $0.stdout : nil } ?? Data()
        // `all` lists untracked files one by one instead of collapsing a new directory into one entry.
        let status = try await git(root, ["status", "--porcelain=v2", "-z", "--untracked-files=all"]).stdout

        // Porcelain paths are relative to the repository root, which is above `root` for a project in a subfolder.
        let top = try await repositoryRoot(root)

        var hasher = SHA256()
        hasher.update(data: head)
        hasher.update(data: Data([0]))
        hasher.update(data: status)
        for path in PorcelainV2(status).paths {
            hasher.update(data: Data("\(path)\0\(fileSignature(top.appending(path: path)))\0".utf8))
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    /// Repository-root-relative paths of every changed, staged and untracked file, for telling the user
    /// what a discard would throw away.
    public func dirtyPaths(_ root: URL) async throws -> [String] {
        let status = try await git(root, ["status", "--porcelain=v2", "-z", "--untracked-files=all"]).stdout
        return PorcelainV2(status).paths
    }

    public func localBranches(_ root: URL) async throws -> Set<String> {
        let output = try await git(root, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]).stdout
        return Set(String(decoding: output, as: UTF8.self).split(whereSeparator: \.isNewline).map(String.init))
    }

    public func createAndSwitch(_ root: URL, branch: String) async throws {
        try validate(branch)
        try await git(root, ["switch", "-c", branch])
    }

    public func switchTo(_ root: URL, branch: String) async throws {
        try validate(branch)
        try await git(root, ["switch", branch])
    }

    /// Deletes a branch with `-d`, which git refuses when it holds commits not merged elsewhere.
    public func deleteBranch(_ root: URL, branch: String) async throws {
        try validate(branch)
        try await git(root, ["branch", "-d", branch])
    }

    /// Switches back to `previous` and deletes `branch`, but only when the working tree is clean, so it
    /// never discards anything. Throws `GitError.uncommittedChanges` otherwise.
    public func abandonBranch(_ root: URL, branch: String, returningTo previous: String) async throws {
        guard try await status(root).dirtyCount == 0 else { throw GitError.uncommittedChanges }
        try await switchTo(root, branch: previous)
        try await deleteBranch(root, branch: branch)
    }

    /// Switches back to `previous` and deletes `branch` without touching the working tree: git carries
    /// uncommitted changes across the switch or refuses when they would be overwritten, in which case
    /// nothing has changed. The branch is deleted with `-d`.
    public func switchBackKeepingChanges(_ root: URL, branch: String, returningTo previous: String) async throws {
        try await switchTo(root, branch: previous)
        try await deleteBranch(root, branch: branch)
    }

    /// Throws away every uncommitted change: `git reset --hard` plus `git clean -fd` for untracked files
    /// and directories (ignored files such as `node_modules` stay). Destructive; the caller must know
    /// that nothing worth keeping is in the working tree.
    public func discardChanges(_ root: URL) async throws {
        try await git(root, ["reset", "--hard"])
        try await git(root, ["clean", "-fd"])
    }

    // MARK: - Helpers

    @discardableResult
    private func git(_ root: URL, _ arguments: [String]) async throws -> ProcessResult {
        let full = ["--no-optional-locks", "-C", root.path] + arguments
        let result = try await runner.run("git", full, in: nil, timeout: timeout)
        guard result.exitCode == 0 else {
            throw GitError.commandFailed(
                arguments: arguments, exitCode: result.exitCode,
                stderr: String(decoding: result.stderr, as: UTF8.self))
        }
        return result
    }

    private func repositoryRoot(_ root: URL) async throws -> URL {
        let output = try await git(root, ["rev-parse", "--show-toplevel"]).stdout
        let path = String(decoding: output, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        return URL(filePath: path)
    }

    private func validate(_ branch: String) throws {
        // A leading dash would be read as an option.
        if branch.isEmpty || branch.hasPrefix("-") {
            throw GitError.invalidBranchName(branch)
        }
    }

    private func lastCommitDate(_ root: URL) async -> Date? {
        guard let result = try? await git(root, ["log", "-1", "--format=%cI"]) else { return nil }
        let text = String(decoding: result.stdout, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        return try? Date(text, strategy: .iso8601)
    }

    private func fileSignature(_ url: URL) -> String {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: url.path) else {
            return "missing"
        }
        let size = (attributes[.size] as? NSNumber)?.uint64Value ?? 0
        let modified = (attributes[.modificationDate] as? Date)?.timeIntervalSince1970 ?? 0
        return "\(size)\0\(modified)"
    }
}
