import Foundation
import Testing

@testable import KitManagerCore

/// A throwaway directory removed by `remove()`.
struct TempDirectory {
    let url: URL

    init() throws {
        // Resolve symlinks so the paths match what git reports.
        let base = FileManager.default.temporaryDirectory.resolvingSymlinksInPath()
        url = base.appending(path: "kit-manager-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    }

    func write(_ relativePath: String, _ contents: String) throws {
        let file = url.appending(path: relativePath)
        try FileManager.default.createDirectory(
            at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(contents.utf8).write(to: file)
    }

    func remove() {
        try? FileManager.default.removeItem(at: url)
    }
}

let realRunner = ProcessRunner(environment: ShellEnvironment(path: ShellEnvironment.fallbackPath))

/// Runs real git with hooks, signing and identity pinned so a developer's global config cannot interfere.
@discardableResult
func git(_ directory: URL, _ arguments: [String]) async throws -> String {
    let pinned = [
        "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
        "-c", "user.name=Kit Tester", "-c", "user.email=kit@example.com",
        "-c", "init.defaultBranch=main",
    ]
    let result = try await realRunner.run("git", pinned + arguments, in: directory, timeout: .seconds(30))
    #expect(result.exitCode == 0, "git \(arguments.joined(separator: " ")): \(String(decoding: result.stderr, as: UTF8.self))")
    return String(decoding: result.stdout, as: UTF8.self)
}
