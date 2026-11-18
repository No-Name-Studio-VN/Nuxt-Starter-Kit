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

        var hasher = SHA256()
        hasher.update(data: head)
        hasher.update(data: Data([0]))
        hasher.update(data: status)
        for path in PorcelainV2(status).paths {
            hasher.update(data: Data("\(path)\0\(fileSignature(root.appending(path: path)))\0".utf8))
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
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
