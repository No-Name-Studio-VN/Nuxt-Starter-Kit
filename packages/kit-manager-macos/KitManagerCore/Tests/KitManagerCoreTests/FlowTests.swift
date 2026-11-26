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
        #expect(precondition(readySnapshot(), latestMain: nil) == .kitUnavailable)
        #expect(precondition(readySnapshot(behind: 0)) == .upToDate)
        #expect(precondition(readySnapshot(git: nil)) == .noBranch)
        #expect(precondition(readySnapshot(git: gitStatus(branch: nil))) == .noBranch)

        #expect(
            UpgradePrecondition.pinned(ref: "v3.0.2").reason
                == "Pinned to v3.0.2. Run nuxt-saas upgrade --template github:No-Name-Studio-VN/Nuxt-Starter-Kit in the project to follow main again.")
        for blocked: UpgradePrecondition in [
            .notKitV3, .unresolvedConflicts, .notOnMain, .kitUnavailable, .upToDate, .noBranch,
            .pinned(ref: "x"),
        ] {
            #expect(blocked.reason?.isEmpty == false)
        }
    }

    @Test func dirtyTreeCanProceedToPreview() {
        #expect(UpgradePrecondition(snapshot: readySnapshot(git: gitStatus(dirty: 3)), latestMain: latest) == .ready)
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

    // MARK: Rollback provenance

    @Test func rollbackPlanFollowsTheRecordAndTheCurrentBranch() {
        let record = UpgradeBranchRecord(branch: "kit-upgrade/v3.1.0", previous: "main")
        func plan(
            record: UpgradeBranchRecord? = record, branch: String = "kit-upgrade/v3.1.0", previous: String = "main",
            current: String?
        ) -> UpgradeRollback.Step {
            UpgradeRollback.plan(record: record, branch: branch, previous: previous, current: current)
        }
        // Still on the upgrade branch: this is the only case that discards changes.
        #expect(plan(current: "kit-upgrade/v3.1.0") == .discardSwitchAndDelete)
        // Already back on the previous branch: nothing to discard, just delete.
        #expect(plan(current: "main") == .deleteOnly)
        // Anywhere else, or detached: refused, nothing is touched.
        for current in ["feature/x", nil] as [String?] {
            guard case .refuse = plan(current: current) else {
                Issue.record("expected a refusal for \(current ?? "detached HEAD")")
                continue
            }
        }
    }

    @Test func rollbackPlanRefusesWithoutAMatchingRecord() {
        let record = UpgradeBranchRecord(branch: "kit-upgrade/v3.1.0", previous: "main")
        let cases: [(UpgradeBranchRecord?, String, String)] = [
            (nil, "kit-upgrade/v3.1.0", "main"),
            (record, "kit-upgrade/other", "main"),
            (record, "kit-upgrade/v3.1.0", "develop"),
            (record, "main", "main"),
        ]
        for (candidate, branch, previous) in cases {
            // Even when the current branch is the requested one, a branch the app did not create is never discarded.
            let step = UpgradeRollback.plan(record: candidate, branch: branch, previous: previous, current: branch)
            guard case .refuse(let reason) = step else {
                Issue.record("expected a refusal for \(branch) / \(previous)")
                continue
            }
            #expect(!reason.isEmpty)
        }
    }

    @Test func rollbackThatKeepsChangesNeverDiscards() {
        let record = UpgradeBranchRecord(branch: "kit-upgrade/v3.1.0", previous: "main", keepsChanges: true)
        func plan(current: String?) -> UpgradeRollback.Step {
            UpgradeRollback.plan(record: record, branch: "kit-upgrade/v3.1.0", previous: "main", current: current)
        }
        #expect(plan(current: "kit-upgrade/v3.1.0") == .switchKeepingChanges)
        #expect(plan(current: "main") == .deleteOnly)
        guard case .refuse = plan(current: "feature/x") else {
            Issue.record("expected a refusal away from both branches")
            return
        }
        // The flag is part of what the caller must present: a plain record never plans the safe path.
        let plain = UpgradeBranchRecord(branch: "kit-upgrade/v3.1.0", previous: "main")
        #expect(
            UpgradeRollback.plan(record: plain, branch: "kit-upgrade/v3.1.0", previous: "main", current: "kit-upgrade/v3.1.0")
                == .discardSwitchAndDelete)
    }

    @Test func dirtyStartRollsBackThroughUndoUnlessItOnlyNeedsToSwitchBack() {
        let branch = "kit-upgrade/v3.2.0"
        let record = UpgradeBranchRecord(branch: branch, previous: "main", startedDirty: true)
        let restored = UpgradeBranchRecord(branch: branch, previous: "main", keepsChanges: true, startedDirty: true)
        #expect(UpgradeRollback.plan(record: record, branch: branch, previous: "main", current: branch) == .undoSwitchAndDelete)
        #expect(UpgradeRollback.plan(record: restored, branch: branch, previous: "main", current: branch) == .switchKeepingChanges)
        #expect(UpgradeRollback.plan(record: record, branch: branch, previous: "main", current: "main") == .deleteOnly)
    }

    @Test func failedDirtyUpgradeNeverSelectsAPreExistingOrAmbiguousBackup() {
        func backup(_ name: String, status: BackupStatus) -> Backup {
            let date = Date(timeIntervalSince1970: 0)
            return Backup(ref: "refs/nuxt-saas/backups/\(name)", name: name, createdAt: date, expiresAt: date, status: status)
        }
        let old = backup("old", status: .failed)
        let interrupted = backup("new", status: .failed)
        let concurrent = backup("another", status: .complete)
        let previous = BackupList(schema: 1, backups: [old])
        #expect(UpgradeRollback.interruptedBackup(previous: previous, current: previous) == nil)
        #expect(UpgradeRollback.interruptedBackup(previous: previous, current: BackupList(schema: 1, backups: [interrupted, old])) == interrupted)
        #expect(UpgradeRollback.interruptedBackup(previous: previous, current: BackupList(schema: 1, backups: [concurrent, old])) == nil)
        #expect(UpgradeRollback.interruptedBackup(previous: previous, current: BackupList(schema: 1, backups: [concurrent, interrupted, old])) == nil)
    }

    @Test func discardSummaryListsPathsAndCountsTheRest() {
        #expect(UpgradeRollback.discardSummary(paths: []) == "No uncommitted changes.")
        #expect(UpgradeRollback.discardSummary(paths: ["a.txt", "b/c.txt"]) == "a.txt\nb/c.txt")
        let many = (1...12).map { "f\($0).txt" }
        let summary = UpgradeRollback.discardSummary(paths: many, limit: 3)
        #expect(summary == "f1.txt\nf2.txt\nf3.txt\nand 9 more")
    }

    @Test func switchBackKeepingChangesPreservesTheUsersEdits() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let repo = try await makeRepository(in: temp)
        let inspector = GitInspector(runner: realRunner)
        try await inspector.createAndSwitch(repo, branch: "kit-upgrade/v3.1.0")
        try Data("edited by the user\n".utf8).write(to: repo.appending(path: "a.txt"))
        try temp.write("repo/notes.txt", "mine")

        try await inspector.switchBackKeepingChanges(repo, branch: "kit-upgrade/v3.1.0", returningTo: "main")

        #expect(try await inspector.status(repo).branch == "main")
        #expect(try await inspector.localBranches(repo) == ["main"])
        #expect(try String(contentsOf: repo.appending(path: "a.txt"), encoding: .utf8) == "edited by the user\n")
        #expect(try String(contentsOf: repo.appending(path: "notes.txt"), encoding: .utf8) == "mine")
    }

    @Test func switchBackKeepingChangesRefusesWhenItWouldOverwriteAnEdit() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let repo = try await makeRepository(in: temp)
        let inspector = GitInspector(runner: realRunner)
        try await inspector.createAndSwitch(repo, branch: "kit-upgrade/v3.1.0")
        try Data("committed upgrade\n".utf8).write(to: repo.appending(path: "a.txt"))
        try await git(repo, ["commit", "-am", "upgrade"])
        try Data("my edit\n".utf8).write(to: repo.appending(path: "a.txt"))

        await #expect(throws: GitError.self) {
            try await inspector.switchBackKeepingChanges(repo, branch: "kit-upgrade/v3.1.0", returningTo: "main")
        }

        #expect(try await inspector.status(repo).branch == "kit-upgrade/v3.1.0")
        #expect(try String(contentsOf: repo.appending(path: "a.txt"), encoding: .utf8) == "my edit\n")
    }

    @Test func dirtyPathsListsEditedStagedAndUntrackedFiles() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let repo = try await makeRepository(in: temp)
        try Data("edited\n".utf8).write(to: repo.appending(path: "a.txt"))
        try temp.write("repo/new-dir/c.txt", "untracked")
        let paths = try await GitInspector(runner: realRunner).dirtyPaths(repo)
        #expect(Set(paths) == ["a.txt", "new-dir/c.txt"])
    }

    // MARK: Abandoning a clean upgrade branch

    @Test func abandonBranchSwitchesBackAndDeletesWithoutDiscarding() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let repo = try await makeRepository(in: temp)
        let inspector = GitInspector(runner: realRunner)
        try await inspector.createAndSwitch(repo, branch: "kit-upgrade/v3.1.0")

        try await inspector.abandonBranch(repo, branch: "kit-upgrade/v3.1.0", returningTo: "main")

        #expect(try await inspector.localBranches(repo) == ["main"])
        #expect(try await inspector.status(repo).branch == "main")
    }

    @Test func abandonBranchRefusesAndKeepsAFileCreatedMeanwhile() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let repo = try await makeRepository(in: temp)
        let inspector = GitInspector(runner: realRunner)
        try await inspector.createAndSwitch(repo, branch: "kit-upgrade/v3.1.0")
        try temp.write("repo/notes.txt", "written by the user")
        try Data("edited\n".utf8).write(to: repo.appending(path: "a.txt"))

        await #expect(throws: GitError.uncommittedChanges) {
            try await inspector.abandonBranch(repo, branch: "kit-upgrade/v3.1.0", returningTo: "main")
        }

        #expect(try await inspector.status(repo).branch == "kit-upgrade/v3.1.0")
        #expect(try await inspector.localBranches(repo).contains("kit-upgrade/v3.1.0"))
        #expect(try String(contentsOf: repo.appending(path: "notes.txt"), encoding: .utf8) == "written by the user")
        #expect(try String(contentsOf: repo.appending(path: "a.txt"), encoding: .utf8) == "edited\n")
    }

    // MARK: Migration folder name

    @Test func folderNameFollowsNpmPackageNameRules() {
        for valid in ["my-app", "a", "my_app", "app.v2", "a1", String(repeating: "a", count: 214)] {
            #expect(MigrationFolderName.problem(with: valid) == nil, "\(valid) should be valid")
        }
        let invalid = [
            "", "   ", "My-App", "my app", "a/b", ".", "..", ".hidden", "_private", "a\0b", "naïve",
            "a;rm -rf x", "$(id)", "a'b", "a\"b", "a`b", "a&b", "a|b", "a\nb",
            String(repeating: "a", count: 215),
        ]
        for name in invalid {
            #expect(MigrationFolderName.problem(with: name) != nil, "\(name) should be invalid")
        }
        // Surrounding whitespace is trimmed by the caller before use, so it is not itself a problem.
        #expect(MigrationFolderName.problem(with: "  my-app ") == nil)
    }

    @Test func folderNameDefaultsToASanitisedPackageNameThenFolder() {
        #expect(MigrationFolderName.defaultName(packageName: "acme-site", folderName: "checkout") == "acme-site")
        #expect(MigrationFolderName.defaultName(packageName: nil, folderName: "checkout") == "checkout")
        #expect(MigrationFolderName.defaultName(packageName: "  ", folderName: "checkout") == "checkout")
        // A scoped package name has a slash, which a folder name cannot.
        #expect(MigrationFolderName.defaultName(packageName: "@acme/site", folderName: "checkout") == "site")
        #expect(MigrationFolderName.defaultName(packageName: nil, folderName: "My Cool App") == "my-cool-app")
        #expect(MigrationFolderName.defaultName(packageName: nil, folderName: ".dotfolder") == "dotfolder")
        #expect(MigrationFolderName.defaultName(packageName: nil, folderName: "naïve  site") == "na-ve-site")
        #expect(MigrationFolderName.defaultName(packageName: nil, folderName: "___") == "project")
        #expect(MigrationFolderName.defaultName(packageName: nil, folderName: "ÄÖÜ") == "project")
        #expect(MigrationFolderName.defaultName(packageName: nil, folderName: String(repeating: "a", count: 300)).count == 214)
        for input in ["My Cool App", ".x", "a$(id)", "ÄÖÜ", "-lead", "trail-", "UPPER_case.v2"] {
            let name = MigrationFolderName.defaultName(packageName: nil, folderName: input)
            #expect(MigrationFolderName.problem(with: name) == nil, "\(input) -> \(name)")
        }
    }

    // MARK: Migration workspace

    @Test func migrationWorkspaceIsCreatedAndStaleOnesAreRemoved() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let fresh = try MigrationWorkspace.create(in: temp.url)
        #expect(FileManager.default.fileExists(atPath: fresh.path))
        #expect(fresh.lastPathComponent.hasPrefix("kit-manager-migration-"))

        let old = try MigrationWorkspace.create(in: temp.url)
        try temp.write("\(old.lastPathComponent)/generated/file.txt", "x")
        try FileManager.default.setAttributes([.modificationDate: Date(timeIntervalSinceNow: -200_000)], ofItemAtPath: old.path)
        // Something that is not ours, however old, stays.
        try temp.write("other-old/file.txt", "x")
        try FileManager.default.setAttributes(
            [.modificationDate: Date(timeIntervalSinceNow: -200_000)], ofItemAtPath: temp.url.appending(path: "other-old").path)

        MigrationWorkspace.removeStale(in: temp.url)

        #expect(FileManager.default.fileExists(atPath: fresh.path))
        #expect(!FileManager.default.fileExists(atPath: old.path))
        #expect(FileManager.default.fileExists(atPath: temp.url.appending(path: "other-old").path))
    }
}

@Suite("Create module selection")
struct CreateModuleSelectionTests {
    @Test func defaultsApplyWithNoExplicitPicks() {
        let selection = CreateModuleSelection(report: report, explicit: [])
        #expect(selection.effective == ["web-security"])
        #expect(selection.defaults == ["web-security"])
        #expect(selection.requiredBy.isEmpty)
        #expect(selection.missingAlternatives.isEmpty)
    }

    @Test func passwordIncludesTransitiveRequirementsButNotEmailVerification() {
        let selection = CreateModuleSelection(report: report, explicit: ["password"])
        #expect(selection.effective == ["web-security", "password", "auth", "email", "database", "server-core"])
        #expect(selection.requiredBy["auth"] == ["password"])
        #expect(selection.requiredBy["database"] == ["auth"])
        #expect(selection.requiredBy["server-core"] == ["database"])
        #expect(selection.missingAlternatives.isEmpty)
    }

    @Test func removingPasswordLeavesIndependentlyPickedLegacyEmail() {
        var explicit: Set<String> = ["email", "password"]
        #expect(CreateModuleSelection(report: report, explicit: explicit).requiredBy["email"] == ["password"])
        explicit.remove("password")
        let selection = CreateModuleSelection(report: report, explicit: explicit)
        #expect(selection.effective == ["web-security", "email"])
        #expect(selection.requiredBy["email"] == nil)
    }

    @Test func removingOneConsumerKeepsSharedRequirements() {
        var explicit: Set<String> = ["passkeys", "oauth"]
        #expect(CreateModuleSelection(report: report, explicit: explicit).requiredBy["auth"] == ["oauth", "passkeys"])
        explicit.remove("passkeys")
        let selection = CreateModuleSelection(report: report, explicit: explicit)
        #expect(selection.effective == ["web-security", "oauth", "auth", "database", "server-core"])
        #expect(selection.requiredBy["auth"] == ["oauth"])
    }

    @Test func passkeysLeavesProviderUnresolvedUntilOAuthIsChosen() {
        let unresolved = CreateModuleSelection(report: report, explicit: ["passkeys"])
        #expect(unresolved.effective == ["web-security", "passkeys", "auth", "database", "server-core"])
        #expect(unresolved.missingAlternatives.map(\.id) == ["auth"])
        #expect(unresolved.missingAlternatives.first?.requiresOneOf == ["password", "oauth"])

        let resolved = CreateModuleSelection(report: report, explicit: ["passkeys", "oauth"])
        #expect(resolved.effective == ["web-security", "passkeys", "oauth", "auth", "database", "server-core"])
        #expect(resolved.missingAlternatives.isEmpty)
    }

    @Test func noSearchResultsLeaveExplicitAndEffectiveSelectionIntact() {
        let explicit: Set<String> = ["password"]
        let modules = report.modules
        #expect(groupModules(modules, matching: "no match", module: { $0 }).isEmpty)
        let selection = CreateModuleSelection(report: report, explicit: explicit)
        #expect(selection.effective.contains("password"))
        #expect(selection.effective.contains("email"))
        #expect(groupModules(modules, matching: "", module: { $0 }).flatMap(\.entries).contains { $0.id == "password" })
    }

    private var report: ModulesReport {
        ModulesReport(schema: 1, commit: "commit", modules: [
            module("server-core"),
            module("database", requires: ["server-core"]),
            module("email", internal: true),
            module("auth", requires: ["database"], requiresOneOf: ["password", "oauth"]),
            module("password", requires: ["auth", "email"]),
            module("oauth", requires: ["auth"]),
            module("passkeys", requires: ["auth"]),
            module("email-verification", requires: ["password"]),
            module("web-security", installByDefault: true),
        ], installed: [])
    }

    private func module(
        _ id: String, requires: [String] = [], requiresOneOf: [String] = [], internal: Bool = false,
        installByDefault: Bool = false
    ) -> KitModuleInfo {
        KitModuleInfo(
            id: id, title: id, description: "", requires: requires, internal: `internal`,
            dependencies: [], devDependencies: [], scripts: [], env: [], bindings: [], rootFiles: [],
            requiresOneOf: requiresOneOf, installByDefault: installByDefault)
    }
}
