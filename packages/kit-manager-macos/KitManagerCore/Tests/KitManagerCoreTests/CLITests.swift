import Foundation
import Testing

@testable import KitManagerCore

private actor StubRunner: ProcessRunning {
    struct Call: Equatable {
        let executable: String
        let arguments: [String]
    }

    private let result: ProcessResult
    private(set) var calls: [Call] = []
    private(set) var timeouts: [Duration] = []

    init(result: ProcessResult) {
        self.result = result
    }

    init(stdout: Data, stderr: String = "", exitCode: Int32 = 0) {
        self.init(result: ProcessResult(exitCode: exitCode, stdout: stdout, stderr: Data(stderr.utf8)))
    }

    init(stdout: String, stderr: String = "", exitCode: Int32 = 0) {
        self.init(stdout: Data(stdout.utf8), stderr: stderr, exitCode: exitCode)
    }

    func run(_ executable: String, _ arguments: [String], in directory: URL?, timeout: Duration) async throws -> ProcessResult {
        calls.append(Call(executable: executable, arguments: arguments))
        timeouts.append(timeout)
        return result
    }
}

/// A throwaway kit checkout with just enough layout for `NuxtSaasCLI.status()`.
private struct FakeKit {
    let root: URL
    let cliDirectory: URL

    init(version: String = NuxtSaasCLI.minimumVersion, built: Bool = true) throws {
        root = FileManager.default.temporaryDirectory.appending(path: "kit-manager-tests-\(UUID().uuidString)")
        cliDirectory = root.appending(path: "packages/create-nuxt-saas")
        let fileManager = FileManager.default
        try fileManager.createDirectory(at: cliDirectory.appending(path: "src/commands"), withIntermediateDirectories: true)
        try Data(#"{"name":"create-nuxt-saas","version":"\#(version)"}"#.utf8)
            .write(to: cliDirectory.appending(path: "package.json"))
        try Data("export {}".utf8).write(to: cliDirectory.appending(path: "src/commands/upgrade.ts"))
        if built {
            try fileManager.createDirectory(at: cliDirectory.appending(path: "dist"), withIntermediateDirectories: true)
            try Data("export {}".utf8).write(to: cliDirectory.appending(path: "dist/cli.mjs"))
            try touch("src/commands/upgrade.ts", at: Date(timeIntervalSinceNow: -100))
            try touch("dist/cli.mjs", at: Date(timeIntervalSinceNow: -50))
        }
    }

    func touch(_ relativePath: String, at date: Date) throws {
        try FileManager.default.setAttributes(
            [.modificationDate: date], ofItemAtPath: cliDirectory.appending(path: relativePath).path)
    }

    func remove() {
        try? FileManager.default.removeItem(at: root)
    }
}

private func fixture(_ name: String) throws -> Data {
    guard let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures") else {
        throw CocoaError(.fileNoSuchFile)
    }
    return try Data(contentsOf: url)
}

@Suite("CLI client")
struct CLITests {
    private let project = URL(filePath: "/tmp/some project")
    private let sha = "bead6d4c1e7989d369942a70c35cba50c187006d"

    @Test func decodesTransitionFixture() async throws {
        let kit = try FakeKit()
        defer { kit.remove() }
        let runner = StubRunner(stdout: try fixture("transition"))
        let report = try await NuxtSaasCLI(kitRoot: kit.root, runner: runner)
            .upgrade(project: project, to: sha, source: .local, check: true)
        #expect(report.schema == 1)
        #expect(report.to == sha)
        #expect(report.changes.count == 21)
        #expect(report.changes.first == FileChangeSummary(path: ".gitignore", kind: .update))
        #expect(report.changes.contains(FileChangeSummary(path: "app/utils/color.ts", kind: .create)))
        #expect(report.conflicts.isEmpty)
        #expect(!report.applied)
    }

    @Test func decodesConflictFixtureWithExitOne() async throws {
        let kit = try FakeKit()
        defer { kit.remove() }
        let runner = StubRunner(stdout: try fixture("transition-conflict"), exitCode: 1)
        let report = try await NuxtSaasCLI(kitRoot: kit.root, runner: runner)
            .upgrade(project: project, to: sha, source: .local, check: true)
        #expect(report.conflicts == ["layers/auth/app/pages/auth/login.vue"])
        #expect(report.changes.contains(FileChangeSummary(path: "layers/auth/app/pages/auth/login.vue", kind: .conflict)))
        #expect(report.changes.contains { $0.kind == .merge })
    }

    @Test func decodesModulesFixture() async throws {
        let kit = try FakeKit()
        defer { kit.remove() }
        let runner = StubRunner(stdout: try fixture("modules"))
        let commit = "b6ae849abcc216450ee77eff3ba51b5067cf71c3"
        let report = try await NuxtSaasCLI(kitRoot: kit.root, runner: runner).modules(at: commit)
        #expect(report.schema == 1)
        #expect(report.commit == commit)
        #expect(report.groups == ["Foundation", "Authentication", "App", "Content"])
        #expect(report.installed.isEmpty)
        #expect(report.modules.count == 17)
        let auth = try #require(report.modules.first { $0.id == "auth" })
        #expect(auth.group == "Authentication")
        #expect(auth.requiresOneOf == ["auth-password", "auth-oauth"])
        let password = try #require(report.modules.first { $0.id == "auth-password" })
        let passkeys = try #require(report.modules.first { $0.id == "auth-passkeys" })
        #expect(password.parent == auth.id)
        #expect(passkeys.parent == password.id)
        let oauth = try #require(report.modules.first { $0.id == "auth-oauth" })
        #expect(oauth.parent == auth.id)
        let dashboard = try #require(report.modules.first { $0.id == "dashboard" })
        #expect(dashboard.group == "App")
        let studio = try #require(report.modules.first { $0.id == "content-studio" })
        #expect(studio.group == "Content")
        #expect(studio.parent == "content")
        let admin = try #require(report.modules.first { $0.id == "admin" })
        #expect(admin.group == "App")
        #expect(admin.parent == nil)
        #expect(admin.requires == ["auth", "dashboard"])
        #expect(admin.requiresOneOf.isEmpty)
        #expect(admin.scripts == ["db:seed"])
        #expect(!admin.internal)
        let adminKV = try #require(report.modules.first { $0.id == "admin-kv" })
        #expect(adminKV.parent == "admin")
        let serverCore = try #require(report.modules.first { $0.id == "server-core" })
        #expect(serverCore.group == nil)
        #expect(serverCore.internal)

        let calls = await runner.calls
        let call = try #require(calls.first)
        #expect(call.executable == "node")
        #expect(call.arguments.contains("--to"))
        #expect(call.arguments.contains("--kit"))
        #expect(call.arguments.contains("--allow-dirty-kit"))
        #expect(call.arguments.contains(commit))
    }

    @Test func decodesInspectFixture() async throws {
        let kit = try FakeKit()
        defer { kit.remove() }
        let runner = StubRunner(stdout: try fixture("inspect"))
        let report = try await NuxtSaasCLI(kitRoot: kit.root, runner: runner)
            .inspect(project: project, source: .recorded)
        #expect(report.modules == ["auth", "database", "server-core"])
        #expect(report.identity == KitIdentity(name: "kmfx-proj", description: "A Nuxt SaaS application"))
        #expect(report.files.count == report.summary.total)
        #expect(report.summary.edited == 2)
        #expect(report.files.filter { $0.status == .edited }.count == 2)
        #expect(report.conflicts.unresolved.isEmpty)
        #expect(report.files.contains { $0.expected })
    }

    @Test func summaryScore() {
        let summary = InspectSummary(
            total: 20, unchanged: 8, edited: 3, deleted: 0, protected: 5, expected: 4, scored: 12, scoredChanged: 3)
        #expect(summary.score == 0.25)
        let empty = InspectSummary(
            total: 0, unchanged: 0, edited: 0, deleted: 0, protected: 0, expected: 0, scored: 0, scoredChanged: 0)
        #expect(empty.score == 0)
    }

    @Test func reportedErrorBecomesFailure() async throws {
        let kit = try FakeKit()
        defer { kit.remove() }
        let runner = StubRunner(stdout: try fixture("error"), exitCode: 1)
        await #expect(
            throws: CLIFailure.reported(message: "/tmp/kmfx-emptydir2 is not a create-nuxt-saas project.", kind: "expected")
        ) {
            _ = try await NuxtSaasCLI(kitRoot: kit.root, runner: runner).inspect(project: project, source: .recorded)
        }
    }

    @Test func unparsableOutputSurfacesStderr() async throws {
        let kit = try FakeKit()
        defer { kit.remove() }
        let runner = StubRunner(stdout: "TypeError: x", stderr: "boom", exitCode: 2)
        await #expect(throws: CLIFailure.unparsable(stderr: "boom", exitCode: 2)) {
            _ = try await NuxtSaasCLI(kitRoot: kit.root, runner: runner).inspect(project: project, source: .recorded)
        }
    }

    @Test func missingNodeSurfacesAsUnparsable() async throws {
        let kit = try FakeKit()
        defer { kit.remove() }
        let runner = StubRunner(stdout: "", stderr: "env: node: No such file or directory\n", exitCode: 127)
        await #expect(
            throws: CLIFailure.unparsable(stderr: "env: node: No such file or directory", exitCode: 127)
        ) {
            _ = try await NuxtSaasCLI(kitRoot: kit.root, runner: runner).inspect(project: project, source: .recorded)
        }
    }

    @Test func unknownSchemaRejected() async throws {
        let kit = try FakeKit()
        defer { kit.remove() }
        let runner = StubRunner(stdout: #"{"schema":2}"#)
        await #expect(throws: CLIFailure.unsupportedSchema(2)) {
            _ = try await NuxtSaasCLI(kitRoot: kit.root, runner: runner).inspect(project: project, source: .recorded)
        }
    }

    @Test func localUpgradePassesKitAndTo() async throws {
        let kit = try FakeKit()
        defer { kit.remove() }
        let runner = StubRunner(stdout: try fixture("transition"))
        _ = try await NuxtSaasCLI(kitRoot: kit.root, runner: runner)
            .upgrade(project: project, to: sha, source: .local, check: true)
        let calls = await runner.calls
        let call = try #require(calls.first)
        #expect(call.executable == "node")
        let script = kit.cliDirectory.appending(path: "bin/nuxt-saas.mjs").path
        #expect(call.arguments.first == script)
        #expect(
            Array(call.arguments.dropFirst())
                == ["upgrade", "--json", "--dir", project.path, "--kit", kit.root.path, "--allow-dirty-kit", "--to", sha, "--check"])
    }

    @Test func localUpgradeWithoutTargetIsRejected() async throws {
        let kit = try FakeKit()
        defer { kit.remove() }
        let runner = StubRunner(stdout: try fixture("transition"))
        await #expect(throws: CLIFailure.self) {
            _ = try await NuxtSaasCLI(kitRoot: kit.root, runner: runner)
                .upgrade(project: project, to: nil, source: .local, check: true)
        }
        #expect(await runner.calls.isEmpty)
    }

    @Test func recordedInspectOmitsKit() async throws {
        let kit = try FakeKit()
        defer { kit.remove() }
        let runner = StubRunner(stdout: try fixture("inspect"))
        _ = try await NuxtSaasCLI(kitRoot: kit.root, runner: runner)
            .inspect(project: project, source: .recorded)
        let calls = await runner.calls
        let call = try #require(calls.first)
        #expect(!call.arguments.contains("--kit"))
        #expect(!call.arguments.contains("--allow-dirty-kit"))
        #expect(!call.arguments.contains("--to"))
        #expect(Array(call.arguments.dropFirst()) == ["inspect", "--json", "--dir", project.path])
    }

    @Test func recordedUpgradeHonoursExplicitTarget() async throws {
        let kit = try FakeKit()
        defer { kit.remove() }
        let runner = StubRunner(stdout: try fixture("transition"))
        _ = try await NuxtSaasCLI(kitRoot: kit.root, runner: runner)
            .upgrade(project: project, to: sha, source: .recorded, check: false)
        let calls = await runner.calls
        let call = try #require(calls.first)
        #expect(Array(call.arguments.dropFirst()) == ["upgrade", "--json", "--dir", project.path, "--to", sha])
    }

    @Test func changeModulesAlwaysUsesLocalKit() async throws {
        let kit = try FakeKit()
        defer { kit.remove() }
        let runner = StubRunner(stdout: try fixture("transition"))
        _ = try await NuxtSaasCLI(kitRoot: kit.root, runner: runner)
            .changeModules(.add, ids: ["admin", "pwa"], project: project, check: true)
        let calls = await runner.calls
        let call = try #require(calls.first)
        #expect(
            Array(call.arguments.dropFirst())
                == ["add", "admin,pwa", "--json", "--dir", project.path, "--kit", kit.root.path, "--allow-dirty-kit", "--check"])
    }

    @Test func rejectsOldCLIVersion() throws {
        let kit = try FakeKit(version: "3.0.2", built: false)
        defer { kit.remove() }
        let cli = NuxtSaasCLI(kitRoot: kit.root, runner: StubRunner(stdout: ""))
        #expect(cli.status() == .tooOld(found: "3.0.2"))
    }

    @Test func comparesVersionsNumerically() {
        #expect(NuxtSaasCLI.isVersion("3.10.0", atLeast: "3.9.0"))
        #expect(!NuxtSaasCLI.isVersion("3.9.0", atLeast: "3.10.0"))
        #expect(NuxtSaasCLI.isVersion("3.1", atLeast: "3.1.0"))
        #expect(NuxtSaasCLI.isVersion("4.0.0", atLeast: "3.99.99"))
        #expect(NuxtSaasCLI.isVersion("3.1.0-beta.1", atLeast: "3.1.0"))
        #expect(!NuxtSaasCLI.isVersion("3.0.10", atLeast: "3.1.0"))
        #expect(!NuxtSaasCLI.isVersion("not-a-version", atLeast: "3.1.0"))
    }

    @Test func detectsMissingCheckout() {
        let root = FileManager.default.temporaryDirectory.appending(path: "kit-manager-tests-\(UUID().uuidString)")
        #expect(NuxtSaasCLI(kitRoot: root, runner: StubRunner(stdout: "")).status() == .missingCheckout)
    }

    @Test func detectsMissingAndStaleBuild() throws {
        let missing = try FakeKit(built: false)
        defer { missing.remove() }
        #expect(NuxtSaasCLI(kitRoot: missing.root, runner: StubRunner(stdout: "")).status() == .missingBuild)

        let kit = try FakeKit()
        defer { kit.remove() }
        let cli = NuxtSaasCLI(kitRoot: kit.root, runner: StubRunner(stdout: ""))
        #expect(cli.status() == .ready)
        try kit.touch("src/commands/upgrade.ts", at: Date())
        #expect(cli.status() == .staleBuild)
    }

    @Test func unavailableCLIIsNotRun() async throws {
        let kit = try FakeKit(built: false)
        defer { kit.remove() }
        let runner = StubRunner(stdout: try fixture("inspect"))
        await #expect(throws: CLIFailure.unavailable(.missingBuild)) {
            _ = try await NuxtSaasCLI(kitRoot: kit.root, runner: runner).inspect(project: project, source: .recorded)
        }
        #expect(await runner.calls.isEmpty)
    }

    @Test func buildRunsPnpmInKitRoot() async throws {
        let kit = try FakeKit(built: false)
        defer { kit.remove() }
        let runner = StubRunner(stdout: "ok")
        try await NuxtSaasCLI(kitRoot: kit.root, runner: runner).build()
        let calls = await runner.calls
        #expect(calls == [StubRunner.Call(executable: "pnpm", arguments: ["--dir", "packages/create-nuxt-saas", "build"])])
    }

    @Test func failedBuildSurfacesStderr() async throws {
        let kit = try FakeKit(built: false)
        defer { kit.remove() }
        let runner = StubRunner(stdout: "", stderr: "build exploded\n", exitCode: 1)
        await #expect(throws: CLIFailure.buildFailed(stderr: "build exploded", exitCode: 1)) {
            try await NuxtSaasCLI(kitRoot: kit.root, runner: runner).build()
        }
    }

    @Test func buildFailureReadsAsABuildFailureNotUnreadableOutput() {
        let message = CLIFailure.buildFailed(stderr: "tsc: error TS2304", exitCode: 2).errorDescription
        #expect(message == "Building the nuxt-saas CLI failed (pnpm build exited with 2): tsc: error TS2304")
        #expect(CLIFailure.buildFailed(stderr: "", exitCode: 1).errorDescription?.hasSuffix("no error output") == true)
        #expect(message?.contains("unreadable") == false)
    }

    @Test func writingRunsGetALongerTimeoutThanReadOnlyOnes() async throws {
        let kit = try FakeKit()
        defer { kit.remove() }
        let transition = try fixture("transition")
        let runner = StubRunner(stdout: transition)
        let cli = NuxtSaasCLI(kitRoot: kit.root, runner: runner)

        _ = try await cli.upgrade(project: project, to: sha, source: .local, check: true)
        _ = try await cli.upgrade(project: project, to: sha, source: .local, check: false)
        _ = try await cli.changeModules(.add, ids: ["auth"], project: project, check: true)
        _ = try await cli.changeModules(.remove, ids: ["auth"], project: project, check: false)

        #expect(
            await runner.timeouts == [.seconds(120), .seconds(15 * 60), .seconds(120), .seconds(15 * 60)])
    }

    @Test func inspectAndModulesKeepTheShortTimeout() async throws {
        let kit = try FakeKit()
        defer { kit.remove() }
        let inspectRunner = StubRunner(stdout: try fixture("inspect"))
        _ = try await NuxtSaasCLI(kitRoot: kit.root, runner: inspectRunner).inspect(project: project, source: .recorded)
        #expect(await inspectRunner.timeouts == [.seconds(120)])

        let modulesRunner = StubRunner(stdout: try fixture("modules"))
        _ = try await NuxtSaasCLI(kitRoot: kit.root, runner: modulesRunner).modules(at: sha)
        #expect(await modulesRunner.timeouts == [.seconds(120)])
    }
}
