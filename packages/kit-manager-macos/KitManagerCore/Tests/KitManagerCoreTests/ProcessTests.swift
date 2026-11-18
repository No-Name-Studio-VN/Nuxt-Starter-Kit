import Foundation
import Testing

@testable import KitManagerCore

private actor InFlightCounter {
    private var current = 0
    private(set) var maximum = 0

    func enter() {
        current += 1
        maximum = max(maximum, current)
    }

    func leave() {
        current -= 1
    }
}

@Suite("Process layer")
struct ProcessTests {
    private let runner = ProcessRunner(environment: ShellEnvironment(path: ShellEnvironment.fallbackPath))

    @Test func runsAndCapturesOutput() async throws {
        let result = try await runner.run("echo", ["hi"], in: nil, timeout: .seconds(5))
        #expect(result.exitCode == 0)
        #expect(String(decoding: result.stdout, as: UTF8.self) == "hi\n")
    }

    @Test func capturesNonZeroExit() async throws {
        let result = try await runner.run("sh", ["-c", "echo err >&2; exit 3"], in: nil, timeout: .seconds(5))
        #expect(result.exitCode == 3)
        #expect(String(decoding: result.stderr, as: UTF8.self) == "err\n")
    }

    @Test func capturesLargeOutputWithoutDeadlock() async throws {
        let result = try await runner.run(
            "sh", ["-c", "head -c 1048576 /dev/zero"], in: nil, timeout: .seconds(10))
        #expect(result.exitCode == 0)
        #expect(result.stdout.count == 1_048_576)
    }

    @Test func runsInDirectory() async throws {
        let directory = URL(filePath: NSTemporaryDirectory(), directoryHint: .notDirectory).resolvingSymlinksInPath()
        let result = try await runner.run("pwd", [], in: directory, timeout: .seconds(5))
        let printed = String(decoding: result.stdout, as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines)
        #expect(URL(filePath: printed).resolvingSymlinksInPath().path() == directory.path())
    }

    @Test func timesOut() async throws {
        // A unique duration makes the child identifiable by its command line.
        let duration = "4.\(Int.random(in: 100_000...999_999))"
        let started = ContinuousClock.now
        await #expect(throws: ProcessError.timedOut) {
            try await runner.run("sleep", [duration], in: nil, timeout: .milliseconds(200))
        }
        #expect(ContinuousClock.now - started < .seconds(3))

        try await Task.sleep(for: .milliseconds(300))
        let check = try await runner.run("pgrep", ["-f", "sleep \(duration)"], in: nil, timeout: .seconds(5))
        #expect(check.exitCode == 1, "the timed-out child should have been terminated")
    }

    @Test func reportsLaunchFailure() async {
        let failing = ProcessRunner(environment: ShellEnvironment(path: ShellEnvironment.fallbackPath))
        await #expect(throws: ProcessError.self) {
            try await failing.run("echo", [], in: URL(filePath: "/nonexistent-directory-for-kit-manager"), timeout: .seconds(5))
        }
    }

    @Test func resolvesLoginPath() async {
        let environment = await ShellEnvironment.resolve(shell: "/bin/zsh")
        #expect(!environment.path.isEmpty)
        #expect(environment.path.contains("/usr/bin"))
        #expect(environment.variables["PATH"] == environment.path)
    }

    @Test func neverPromptsForGitCredentials() {
        let environment = ShellEnvironment(path: ShellEnvironment.fallbackPath)
        #expect(environment.variables["GIT_TERMINAL_PROMPT"] == "0")
    }

    @Test func describesProcessErrors() {
        #expect(ProcessError.timedOut.errorDescription == "The command timed out.")
        #expect(ProcessError.launchFailed("no such file").errorDescription == "Could not start the command: no such file")
    }

    @Test func fallsBackOnBadShell() async {
        let environment = await ShellEnvironment.resolve(shell: "/nonexistent")
        #expect(environment.path == ShellEnvironment.fallbackPath)
    }

    @Test func fallsBackWithoutShell() async {
        let environment = await ShellEnvironment.resolve(shell: nil)
        #expect(environment.path == ShellEnvironment.fallbackPath)
    }

    @Test func quotesSingleQuotes() {
        #expect(shellQuote("a'b c") == "'a'\\''b c'")
        #expect(shellQuote("") == "''")
    }

    @Test func limiterCapsConcurrency() async throws {
        let limiter = RenderLimiter(limit: 2)
        let counter = InFlightCounter()
        try await withThrowingTaskGroup(of: Void.self) { group in
            for _ in 0..<6 {
                group.addTask {
                    try await limiter.run {
                        await counter.enter()
                        try await Task.sleep(for: .milliseconds(80))
                        await counter.leave()
                    }
                }
            }
            try await group.waitForAll()
        }
        #expect(await counter.maximum == 2)
    }

    @Test func limiterReleasesSlotOnError() async throws {
        struct Boom: Error {}
        let limiter = RenderLimiter(limit: 1)
        await #expect(throws: Boom.self) {
            try await limiter.run { throw Boom() }
        }
        let value = try await limiter.run { 42 }
        #expect(value == 42)
    }
}
