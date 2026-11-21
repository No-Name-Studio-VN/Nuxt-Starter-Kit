import Foundation
import Testing

@testable import KitManagerCore

private actor StubRunner: ProcessRunning {
    struct Call: Equatable {
        let executable: String
        let arguments: [String]
    }

    private(set) var calls: [Call] = []

    func run(_ executable: String, _ arguments: [String], in directory: URL?, timeout: Duration) async throws -> ProcessResult {
        calls.append(Call(executable: executable, arguments: arguments))
        return ProcessResult(exitCode: 0, stdout: Data(), stderr: Data())
    }
}

private func module(
    _ id: String, title: String = "", description: String = "", internal isInternal: Bool = false,
    dependencies: [String] = []
) -> KitModuleInfo {
    KitModuleInfo(
        id: id, title: title, description: description, requires: [], internal: isInternal,
        dependencies: dependencies, devDependencies: [], scripts: [], env: [], bindings: [], rootFiles: [])
}

private func report(
    changes: [FileChangeSummary] = [], conflicts: [String] = [], followUps: [String] = []
) -> TransitionReport {
    TransitionReport(
        schema: 1, from: "v3.0.0", to: "v3.1.0", changes: changes, conflicts: conflicts,
        followUps: followUps, addedModules: [], removedModules: [], applied: true, upToDate: nil)
}

private let catalogue = [
    module("auth-password", title: "Password sign-in", description: "Username and password sign-in"),
    module("pwa", title: "PWA", description: "Installable app"),
    module("server-core", title: "Server core", description: "Shared server code", internal: true),
]

@Suite("Actions")
struct ActionTests {
    @Test func upgradePromptContainsMarkersFollowUpsAndNoCommit() {
        let prompt = PromptBuilder.upgrade(
            UpgradePromptInput(
                projectName: "my-app", fromLabel: "v3.0.0", toLabel: "v3.1.0",
                report: report(
                    changes: [
                        FileChangeSummary(path: "app/app.vue", kind: .conflict),
                        FileChangeSummary(path: "layers/auth/index.ts", kind: .create),
                    ],
                    conflicts: ["app/app.vue"], followUps: ["pnpm db:generate"]),
                scripts: ["typecheck"]))

        #expect(prompt.contains("v3.0.0 → v3.1.0"))
        #expect(prompt.contains("conflict app/app.vue"))
        #expect(prompt.contains("create layers/auth/index.ts"))
        for marker in ["<<<<<<< yours", "||||||| kit (old)", "=======", ">>>>>>> kit (new)"] {
            #expect(prompt.contains(marker))
        }
        #expect(prompt.contains("pnpm db:generate"))
        #expect(prompt.contains("pnpm typecheck"))
        #expect(!prompt.contains("pnpm test"))
        #expect(prompt.contains("Resolve every conflict, keeping this project's intent."))
        #expect(prompt.contains("Run the follow-ups."))
        #expect(prompt.contains("Never hand-edit generated migration SQL or snapshots."))
        #expect(prompt.contains("Do not commit"))
    }

    @Test func upgradePromptRunsBothScriptsWhenPresent() {
        let prompt = PromptBuilder.upgrade(
            UpgradePromptInput(
                projectName: "my-app", fromLabel: "a", toLabel: "b", report: report(),
                scripts: ["typecheck", "test"]))
        #expect(prompt.contains("Then run `pnpm typecheck` and `pnpm test`"))
    }

    @Test func upgradePromptSkipsChecksWhenNoScripts() {
        let prompt = PromptBuilder.upgrade(
            UpgradePromptInput(
                projectName: "my-app", fromLabel: "a", toLabel: "b", report: report(), scripts: []))
        #expect(!prompt.contains("pnpm typecheck"))
        #expect(!prompt.contains("pnpm test"))
    }

    @Test func migrationPromptUsesFolderNameAndModules() {
        let prompt = PromptBuilder.migration(
            MigrationPromptInput(
                projectName: "my-app", folderName: "my-app", source: .nuxt,
                catalogue: catalogue, selected: ["auth-password", "pwa"],
                temporaryDirectory: URL(filePath: "/tmp/km-migrate")))

        #expect(prompt.contains("npm create nuxt-saas@latest /tmp/km-migrate/my-app -- --yes --modules auth-password,pwa --no-git"))
        #expect(prompt.contains("kit-migration"))
        #expect(prompt.contains("auth-password — Password sign-in: Username and password sign-in"))
        #expect(prompt.contains("pwa — PWA: Installable app"))
        #expect(!prompt.contains("server-core"))
        #expect(prompt.contains("success()"))
        #expect(prompt.contains("apiError"))
        #expect(prompt.contains("Do not commit"))
        #expect(!prompt.contains("create-nuxt-saas 2.x"))
    }

    @Test func migrationPromptQuotesTemporaryDirectoryWithSpaces() {
        let prompt = PromptBuilder.migration(
            MigrationPromptInput(
                projectName: "my-app", folderName: "my-app", source: .other,
                catalogue: catalogue, selected: ["auth-password"],
                temporaryDirectory: URL(filePath: "/tmp/km migrate")))
        #expect(prompt.contains("npm create nuxt-saas@latest '/tmp/km migrate/my-app' -- --yes --modules auth-password --no-git"))
    }

    @Test func legacyMigrationQuotesCLIGuidance() {
        let prompt = PromptBuilder.migration(
            MigrationPromptInput(
                projectName: "old", folderName: "old", source: .legacy, catalogue: catalogue,
                selected: [], temporaryDirectory: URL(filePath: "/tmp/km-migrate")))
        #expect(
            prompt.contains(
                "This project was created by create-nuxt-saas 2.x, which this version cannot manage. Generate a new project with `npm create nuxt-saas@latest` and move your code across."
            ))
        #expect(!prompt.contains("--modules"))
    }

    @Test func suggestsModulesFromDependencies() {
        let modules = [
            module("auth-passkeys", dependencies: ["@simplewebauthn/server"]),
            module("server-core", internal: true, dependencies: ["vue"]),
            module("pwa", dependencies: ["@vite-pwa/nuxt"]),
        ]
        #expect(
            ModuleSuggester.suggest(dependencies: ["@simplewebauthn/server", "vue"], catalogue: modules)
                == ["auth-passkeys"])
    }

    @Test func suggestionsAreSorted() {
        let modules = [
            module("pwa", dependencies: ["x"]), module("auth", dependencies: ["x"]),
        ]
        #expect(ModuleSuggester.suggest(dependencies: ["x"], catalogue: modules) == ["auth", "pwa"])
    }

    @Test func branchNameSanitisesAndAvoidsCollisions() {
        #expect(BranchNamer.upgradeBranch(label: "v3.0.1 +4", existing: []) == "kit-upgrade/v3.0.1-4")
        #expect(
            BranchNamer.upgradeBranch(label: "v3.0.1 +4", existing: ["kit-upgrade/v3.0.1-4"])
                == "kit-upgrade/v3.0.1-4-2")
        #expect(
            BranchNamer.upgradeBranch(
                label: "v3.0.1 +4", existing: ["kit-upgrade/v3.0.1-4", "kit-upgrade/v3.0.1-4-2"])
                == "kit-upgrade/v3.0.1-4-3")
        #expect(BranchNamer.migrationBranch == "kit-migration")
    }

    @Test func branchNameHandlesUnusableLabels() {
        #expect(BranchNamer.upgradeBranch(label: "a..b", existing: []) == "kit-upgrade/a.b")
        #expect(BranchNamer.upgradeBranch(label: "///", existing: []) == "kit-upgrade/update")
        #expect(BranchNamer.upgradeBranch(label: "x.lock", existing: []) == "kit-upgrade/x-lock")
    }

    @Test func scriptQuotesHostilePaths() {
        let script = Launcher.script(
            directory: URL(filePath: "/tmp/a b/it's ü"), command: .shell, path: "/usr/bin:/bin")
        #expect(script.contains("cd '/tmp/a b/it'\\''s ü' || exit 1"))
        #expect(script.hasPrefix("#!/bin/zsh\n"))
        #expect(script.contains("export PATH='/usr/bin:/bin'"))
        #expect(script.hasSuffix("exec \"$SHELL\" -l\n"))
    }

    @Test func scriptRunsTheRequestedCommand() {
        let directory = URL(filePath: "/tmp/p")
        let claude = Launcher.script(directory: directory, command: .claude, path: "/bin")
        let resume = Launcher.script(directory: directory, command: .claudeContinue, path: "/bin")
        let shell = Launcher.script(directory: directory, command: .shell, path: "/bin")
        #expect(claude.contains("\nclaude\n"))
        #expect(resume.contains("\nclaude --continue\n"))
        #expect(!shell.contains("claude"))
    }

    @Test func scriptForPromptCatsFile() {
        let script = Launcher.script(
            directory: URL(filePath: "/tmp/p"),
            command: .claudePrompt(file: URL(filePath: "/tmp/c a/it's.prompt.md")), path: "/bin")
        #expect(script.contains("claude \"$(cat '/tmp/c a/it'\\''s.prompt.md')\""))
    }

    @Test func openTerminalWritesExecutableScriptAndOpensIt() async throws {
        let scratch = try TempDirectory()
        defer { scratch.remove() }
        let runner = StubRunner()
        let launcher = Launcher(
            scriptsDirectory: scratch.url.appending(path: "scripts"),
            environment: ShellEnvironment(path: "/usr/bin"), runner: runner)

        try await launcher.openTerminal(at: URL(filePath: "/tmp/project"), command: .claude)

        let calls = await runner.calls
        #expect(calls.count == 1)
        #expect(calls.first?.executable == "open")
        #expect(calls.first?.arguments.first == "-a")
        #expect(calls.first?.arguments.dropFirst().first == "Terminal")
        let scriptPath = try #require(calls.first?.arguments.last)
        #expect(scriptPath.hasSuffix(".command"))
        let attributes = try FileManager.default.attributesOfItem(atPath: scriptPath)
        #expect((attributes[.posixPermissions] as? NSNumber)?.intValue == 0o755)
        let contents = try String(contentsOfFile: scriptPath, encoding: .utf8)
        #expect(contents.contains("cd '/tmp/project' || exit 1"))
        #expect(contents.contains("export PATH='/usr/bin'"))
    }

    @Test func writePromptStoresTextInScriptsDirectory() throws {
        let scratch = try TempDirectory()
        defer { scratch.remove() }
        let directory = scratch.url.appending(path: "scripts")
        let launcher = Launcher(
            scriptsDirectory: directory, environment: ShellEnvironment(path: "/usr/bin"), runner: StubRunner())

        let file = try launcher.writePrompt("hello ü")

        #expect(file.deletingLastPathComponent().standardizedFileURL == directory.standardizedFileURL)
        #expect(file.lastPathComponent.hasSuffix(".prompt.md"))
        #expect(try String(contentsOf: file, encoding: .utf8) == "hello ü")
    }

    @Test func opensVSCodeAndRevealsInFinder() async throws {
        let runner = StubRunner()
        let launcher = Launcher(
            scriptsDirectory: URL(filePath: "/tmp/unused"), environment: ShellEnvironment(path: "/usr/bin"),
            runner: runner)
        let project = URL(filePath: "/tmp/my project")

        try await launcher.openInVSCode(project)
        try await launcher.revealInFinder(project)

        let calls = await runner.calls
        #expect(
            calls == [
                StubRunner.Call(executable: "open", arguments: ["-b", "com.microsoft.VSCode", "/tmp/my project"]),
                StubRunner.Call(executable: "open", arguments: ["-R", "/tmp/my project"]),
            ])
    }

    @Test func openFailureSurfacesStderr() async throws {
        struct Failing: ProcessRunning {
            func run(_ executable: String, _ arguments: [String], in directory: URL?, timeout: Duration) async throws -> ProcessResult {
                ProcessResult(exitCode: 1, stdout: Data(), stderr: Data("no such app".utf8))
            }
        }
        let launcher = Launcher(
            scriptsDirectory: URL(filePath: "/tmp/unused"), environment: ShellEnvironment(path: "/usr/bin"),
            runner: Failing())
        await #expect(throws: LaunchError.self) {
            try await launcher.openInVSCode(URL(filePath: "/tmp/p"))
        }
    }

    @Test func removeStaleFilesOnlyDeletesOldOwnFiles() throws {
        let scratch = try TempDirectory()
        defer { scratch.remove() }
        let directory = scratch.url.appending(path: "scripts")
        try scratch.write("scripts/11111111-1111-1111-1111-111111111111.command", "x")
        try scratch.write("scripts/22222222-2222-2222-2222-222222222222.prompt.md", "x")
        try scratch.write("scripts/33333333-3333-3333-3333-333333333333.command", "x")
        try scratch.write("scripts/old-other.txt", "x")
        let longAgo = Date(timeIntervalSinceNow: -200_000)
        for name in ["11111111-1111-1111-1111-111111111111.command", "22222222-2222-2222-2222-222222222222.prompt.md", "old-other.txt"] {
            try FileManager.default.setAttributes(
                [.modificationDate: longAgo], ofItemAtPath: directory.appending(path: name).path)
        }
        let launcher = Launcher(
            scriptsDirectory: directory, environment: ShellEnvironment(path: "/usr/bin"), runner: StubRunner())

        launcher.removeStaleFiles()

        let remaining = try FileManager.default.contentsOfDirectory(atPath: directory.path).sorted()
        #expect(remaining == ["33333333-3333-3333-3333-333333333333.command", "old-other.txt"])
    }
}
