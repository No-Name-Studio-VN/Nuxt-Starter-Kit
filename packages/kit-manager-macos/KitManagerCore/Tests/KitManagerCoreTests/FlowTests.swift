import Foundation
import Testing

@testable import KitManagerCore

private let sha = "bead6d4c1e7989d369942a70c35cba50c187006d"
private let latest = "a3a7bfe0000000000000000000000000000000aa"
private let defaultKit = "github:No-Name-Studio-VN/Nuxt-Starter-Kit"

private func kitState(kit: String = defaultKit, conflicts: [String] = []) -> KitState {
    KitState(
        version: 3, kit: kit, commit: sha, modules: ["auth"],
        identity: KitIdentity(name: "Acme", description: "Acme app"), conflicts: conflicts)
}

private func gitStatus(branch: String? = "main", dirty: Int = 0) -> GitStatus {
    GitStatus(head: sha, branch: branch, dirtyCount: dirty, ahead: nil, behind: nil, lastCommitDate: nil)
}

/// A kit v3 project on the default template, behind main, on a clean branch.
private func readySnapshot(
    kit: String = defaultKit, conflicts: [String] = [], availability: CommitAvailability? = .onMain,
    behind: Int? = 2, git: GitStatus? = gitStatus(), isKitSource: Bool = false
) -> ProjectSnapshot {
    ProjectSnapshot(
        kind: .kitV3(kitState(kit: kit, conflicts: conflicts)), isKitSource: isKitSource, git: git,
        availability: availability, behind: behind)
}

private func change(_ index: Int, kind: ChangeKind = .update) -> FileChangeSummary {
    FileChangeSummary(path: "app/file-\(index).vue", kind: kind)
}

private func report(
    changes: [FileChangeSummary] = [], conflicts: [String] = [], followUps: [String] = []
) -> TransitionReport {
    TransitionReport(
        schema: 1, from: sha, to: latest, changes: changes, conflicts: conflicts, followUps: followUps,
        addedModules: [], removedModules: [], applied: true, upToDate: nil)
}

private func makeRepository(in temp: TempDirectory) async throws -> URL {
    let repo = temp.url.appending(path: "repo")
    try FileManager.default.createDirectory(at: repo, withIntermediateDirectories: true)
    try await git(repo, ["init"])
    try Data("*.log\n".utf8).write(to: repo.appending(path: ".gitignore"))
    try Data("one\n".utf8).write(to: repo.appending(path: "a.txt"))
    try await git(repo, ["add", "-A"])
    try await git(repo, ["commit", "-m", "initial"])
    return repo
}

@Suite("Upgrade and migrate flows")
struct FlowTests {
    // MARK: Upgrade preconditions

    @Test func readyProjectCanUpgrade() {
        #expect(UpgradePrecondition(snapshot: readySnapshot(), latestMain: latest) == .ready)
        #expect(UpgradePrecondition.ready.reason == nil)
    }

    @Test func preconditionsExplainWhyNot() {
        func precondition(_ snapshot: ProjectSnapshot, latestMain: String? = latest) -> UpgradePrecondition {
            UpgradePrecondition(snapshot: snapshot, latestMain: latestMain)
        }
        #expect(precondition(ProjectSnapshot(kind: .nuxt)) == .notKitV3)
        #expect(precondition(ProjectSnapshot(kind: .kitLegacy)) == .notKitV3)
        #expect(precondition(readySnapshot(isKitSource: true)) == .notKitV3)
        #expect(precondition(readySnapshot(conflicts: ["a.vue"])) == .unresolvedConflicts)
        #expect(precondition(readySnapshot(kit: "\(defaultKit)#v3.0.2", behind: nil)) == .pinned(ref: "v3.0.2"))
        #expect(precondition(readySnapshot(kit: "github:someone/fork")) == .notOnMain)
        #expect(precondition(readySnapshot(availability: .notOnMain, behind: nil)) == .notOnMain)
        #expect(precondition(readySnapshot(availability: nil, behind: nil)) == .notOnMain)
        #expect(precondition(readySnapshot(), latestMain: nil) == .notOnMain)
        #expect(precondition(readySnapshot(behind: 0)) == .upToDate)
        #expect(precondition(readySnapshot(git: nil)) == .noBranch)
        #expect(precondition(readySnapshot(git: gitStatus(branch: nil))) == .noBranch)
        #expect(precondition(readySnapshot(git: gitStatus(dirty: 3))) == .dirtyTree)

        #expect(
            UpgradePrecondition.pinned(ref: "v3.0.2").reason
                == "Pinned to v3.0.2. Change the template ref in .nuxt-saas.json to upgrade.")
        #expect(UpgradePrecondition.dirtyTree.reason == "Commit or stash your changes first.")
        for blocked: UpgradePrecondition in [
            .notKitV3, .unresolvedConflicts, .dirtyTree, .notOnMain, .upToDate, .noBranch, .pinned(ref: "x"),
        ] {
            #expect(blocked.reason?.isEmpty == false)
        }
    }

    @Test func unresolvedConflictsComeFromLoadedInspect() {
        var snapshot = readySnapshot()
        snapshot.inspect = .loaded(
            InspectReport(
                schema: 1, commit: sha, kit: defaultKit, modules: [], identity: KitIdentity(name: "a", description: ""),
                conflicts: InspectConflicts(recorded: [], unresolved: ["x.vue"]), files: [],
                summary: InspectSummary(
                    total: 0, unchanged: 0, edited: 0, deleted: 0, protected: 0, expected: 0, scored: 0, scoredChanged: 0)),
            stale: false)
        #expect(UpgradePrecondition(snapshot: snapshot, latestMain: latest) == .unresolvedConflicts)
    }

    // MARK: Discarding an upgrade

    @Test func discardChangesRemovesEditsStagedAndUntrackedButKeepsIgnored() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let repo = try await makeRepository(in: temp)
        let inspector = GitInspector(runner: realRunner)
        try Data("edited\n".utf8).write(to: repo.appending(path: "a.txt"))
        try Data("staged\n".utf8).write(to: repo.appending(path: "b.txt"))
        try await git(repo, ["add", "b.txt"])
        try temp.write("repo/new-dir/c.txt", "untracked")
        try temp.write("repo/debug.log", "ignored")
        #expect(try await inspector.status(repo).dirtyCount == 3)

        try await inspector.discardChanges(repo)

        #expect(try await inspector.status(repo).dirtyCount == 0)
        #expect(try String(contentsOf: repo.appending(path: "a.txt"), encoding: .utf8) == "one\n")
        #expect(!FileManager.default.fileExists(atPath: repo.appending(path: "b.txt").path))
        #expect(!FileManager.default.fileExists(atPath: repo.appending(path: "new-dir").path))
        #expect(FileManager.default.fileExists(atPath: repo.appending(path: "debug.log").path))
    }

    @Test func discardChangesThrowsOutsideARepository() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        await #expect(throws: GitError.self) {
            try await GitInspector(runner: realRunner).discardChanges(temp.url)
        }
    }

    @Test func rollbackSequenceRestoresTheOriginalBranch() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let repo = try await makeRepository(in: temp)
        let inspector = GitInspector(runner: realRunner)
        try await inspector.createAndSwitch(repo, branch: "kit-upgrade/v3.1.0")
        try Data("upgraded\n".utf8).write(to: repo.appending(path: "a.txt"))
        try temp.write("repo/added.txt", "new")

        try await inspector.discardChanges(repo)
        try await inspector.switchTo(repo, branch: "main")
        try await inspector.deleteBranch(repo, branch: "kit-upgrade/v3.1.0")

        #expect(try await inspector.localBranches(repo) == ["main"])
        #expect(try await inspector.status(repo).dirtyCount == 0)
        #expect(try String(contentsOf: repo.appending(path: "a.txt"), encoding: .utf8) == "one\n")
    }

    // MARK: Prompts

    @Test func moduleChangePromptTalksAboutTheModulesNotAnUpgrade() {
        let prompt = PromptBuilder.moduleChange(
            ModuleChangePromptInput(
                projectName: "my-app", versionLabel: "v3.1.0", action: .add, moduleIDs: ["pwa", "billing"],
                report: report(
                    changes: [FileChangeSummary(path: "app/app.vue", kind: .conflict)], conflicts: ["app/app.vue"],
                    followUps: ["pnpm install"]),
                scripts: ["test"]))

        #expect(prompt.contains("adding pwa, billing"))
        #expect(prompt.contains("kit v3.1.0"))
        #expect(!prompt.contains("→"))
        #expect(!prompt.contains("upgraded"))
        #expect(prompt.contains("already applied"))
        #expect(prompt.contains("conflict app/app.vue"))
        for marker in ["<<<<<<< yours", "||||||| kit (old)", "=======", ">>>>>>> kit (new)"] {
            #expect(prompt.contains(marker))
        }
        #expect(prompt.contains("pnpm install"))
        #expect(prompt.contains("`pnpm test`"))
        #expect(prompt.contains("Resolve every conflict, keeping this project's intent."))
        #expect(prompt.contains("Do not commit"))
    }

    @Test func moduleChangePromptWordsRemoval() {
        let prompt = PromptBuilder.moduleChange(
            ModuleChangePromptInput(
                projectName: "my-app", versionLabel: "v3.1.0", action: .remove, moduleIDs: ["pwa"],
                report: report(), scripts: []))
        #expect(prompt.contains("removing pwa"))
    }

    @Test func upgradePromptCapsTheChangeList() {
        let changes = (0..<250).map { change($0) }
        let prompt = PromptBuilder.upgrade(
            UpgradePromptInput(
                projectName: "big", fromLabel: "v3.0.0", toLabel: "v3.1.0", report: report(changes: changes), scripts: []))

        #expect(PromptBuilder.maxListedChanges == 200)
        #expect(prompt.contains("- update app/file-199.vue"))
        #expect(!prompt.contains("app/file-200.vue"))
        #expect(prompt.contains("…and 50 more"))
        #expect(prompt.utf8.count < 20_000)
    }

    @Test func promptDoesNotMentionMoreWhenTheListFits() {
        let prompt = PromptBuilder.upgrade(
            UpgradePromptInput(
                projectName: "p", fromLabel: "a", toLabel: "b", report: report(changes: (0..<200).map { change($0) }),
                scripts: []))
        #expect(prompt.contains("app/file-199.vue"))
        #expect(!prompt.contains("…and"))
    }

    @Test func moduleChangePromptCapsTheChangeListToo() {
        let prompt = PromptBuilder.moduleChange(
            ModuleChangePromptInput(
                projectName: "big", versionLabel: "v3.1.0", action: .add, moduleIDs: ["pwa"],
                report: report(changes: (0..<201).map { change($0) }), scripts: []))
        #expect(prompt.contains("…and 1 more"))
    }

    @Test func conflictsAreNeverCapped() {
        let conflicts = (0..<250).map { "src/conflict-\($0).ts" }
        let prompt = PromptBuilder.upgrade(
            UpgradePromptInput(
                projectName: "p", fromLabel: "a", toLabel: "b", report: report(conflicts: conflicts), scripts: []))
        #expect(prompt.contains("- src/conflict-249.ts"))
    }

    // MARK: Migration folder name

    @Test func folderNameValidation() {
        #expect(MigrationFolderName.problem(with: "my-app") == nil)
        #expect(MigrationFolderName.problem(with: "  my app ") == nil)
        #expect(MigrationFolderName.problem(with: "") != nil)
        #expect(MigrationFolderName.problem(with: "   ") != nil)
        #expect(MigrationFolderName.problem(with: "a/b") != nil)
        #expect(MigrationFolderName.problem(with: ".") != nil)
        #expect(MigrationFolderName.problem(with: "..") != nil)
        #expect(MigrationFolderName.problem(with: "a\0b") != nil)
    }

    @Test func folderNameDefaultsToPackageNameThenFolder() {
        #expect(MigrationFolderName.defaultName(packageName: "acme-site", folderName: "checkout") == "acme-site")
        #expect(MigrationFolderName.defaultName(packageName: nil, folderName: "checkout") == "checkout")
        #expect(MigrationFolderName.defaultName(packageName: "  ", folderName: "checkout") == "checkout")
        // A scoped package name has a slash, which a folder name cannot.
        #expect(MigrationFolderName.defaultName(packageName: "@acme/site", folderName: "checkout") == "site")
    }
}
