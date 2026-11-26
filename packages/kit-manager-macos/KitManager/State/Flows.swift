import AppKit
import Foundation
import KitManagerCore

/// The upgrade and migration flows (spec 2.8 and 2.9).
extension AppModel {
    // MARK: Upgrade

    func upgradePrecondition(_ project: Project) -> UpgradePrecondition {
        guard let snapshot = snapshots[project.id] else { return .notKitV3 }
        return UpgradePrecondition(snapshot: snapshot, latestMain: latestMain)
    }

    /// True when the upgrade can start: every precondition holds and the CLI is built.
    func canUpgrade(_ project: Project) -> Bool {
        upgradePrecondition(project) == .ready && cliStatus == .ready
    }

    /// The upgrade branch this app created and has not finished with; the only branch a rollback may discard.
    func rollbackRecord(for project: Project) -> UpgradeBranchRecord? {
        upgradeBranches[project.id]
    }

    /// Upgrade… for kit v3 projects that are behind, Migrate… for the others. The kit checkout itself has neither.
    func flowMenuItem(for project: Project) -> FlowMenuItem {
        guard let snapshot = snapshots[project.id], !snapshot.isKitSource else { return .none }
        switch snapshot.kind {
        case .kitV3:
            let precondition = upgradePrecondition(project)
            return precondition == .upToDate ? .none : .upgrade(isEnabled: canUpgrade(project))
        case .kitLegacy, .nuxt, .other:
            return .migrate
        case .missing, .invalidState:
            return .none
        }
    }

    /// The default and optional one-time targets in the same fetched main history.
    func upgradeTargets(for project: Project) async throws -> (main: UpgradeTarget, releases: Result<[UpgradeTarget], any Error>) {
        guard let state = snapshots[project.id]?.kitState else { throw FlowError.projectUnknown }
        let kit = kit
        let main = try await kit.latestMain()
        let target = UpgradeTarget.main(commit: main, label: await kit.versionLabel(for: main))
        do {
            return (target, .success(try await kit.upgradeReleases(from: state.commit, through: main)))
        } catch {
            return (target, .failure(error))
        }
    }

    func proposedUpgradeBranch(for project: Project, target: UpgradeTarget) async -> String? {
        guard let existing = try? await git.localBranches(project.url) else { return nil }
        return BranchNamer.upgradeBranch(label: target.label, existing: existing)
    }

    /// Keep one-time target previews in the sheet; the dashboard's cached preview still follows main.
    func loadUpgradePreview(_ project: Project, target: UpgradeTarget) async throws -> UpgradeReview {
        let ref = ProjectRef(project)
        guard canUpgrade(project), let state = snapshots[ref.id]?.kitState else {
            if let reason = upgradePrecondition(project).reason { throw UpdateReportError.actionNotApplied(reason) }
            throw CLIFailure.unavailable(cliStatus)
        }
        let (before, _) = try await readUpgradeContext(ref)
        guard before.state == state, try await kit.isCurrentUpgradeTarget(target, from: state.commit) else {
            throw FlowError.upgradePreviewChanged
        }
        let report = try await checkUpgrade(ref.url, target: target)
        let (after, _) = try await readUpgradeContext(ref)
        guard before == after, try await kit.isCurrentUpgradeTarget(target, from: after.state.commit),
            let review = UpgradeReview(context: before, target: target, report: report)
        else {
            throw FlowError.upgradePreviewChanged
        }
        return review
    }

    private func checkUpgrade(_ url: URL, target: UpgradeTarget) async throws -> TransitionReport {
        let cli = cli
        return try await limiter.run {
            try await cli.upgrade(project: url, to: target.commit, source: .local, check: true)
        }
    }

    private func readUpgradeContext(_ ref: ProjectRef) async throws -> (UpgradeReview.Context, GitStatus) {
        let git = git
        let kitPath = AppSettings.kitPath
        async let status = git.status(ref.url)
        async let fingerprint = git.fingerprint(ref.url)
        let current = try await status
        let tree = try await fingerprint
        guard isCurrentUpgradeProject(ref, kitPath: kitPath),
            case .kitV3(let state) = ProjectClassifier.classify(ref.url), state.usesDefaultTemplate,
            let branch = current.branch
        else { throw FlowError.upgradePreviewChanged }
        return (UpgradeReview.Context(
            id: ref.id, url: ref.url, state: state, branch: branch, fingerprint: tree, kitPath: kitPath), current)
    }

    private func isCurrentUpgradeProject(_ ref: ProjectRef, kitPath: String) -> Bool {
        guard case .upgrade(let project)? = flow, project.id == ref.id else { return false }
        return fetchProject(id: ref.id)?.url == ref.url && AppSettings.kitPath == kitPath
    }

    /// Recheck the same plan before switching to a new branch. Claude is never launched by Apply.
    func runUpgrade(_ project: Project, reviewed: UpgradeReview, backup: Bool) async throws -> UpgradeOutcome {
        let ref = ProjectRef(project)
        guard upgradePrecondition(project) == .ready, let snapshot = snapshots[ref.id],
            snapshot.kitState == reviewed.context.state, reviewed.context.id == ref.id, reviewed.context.url == ref.url,
            reviewed.context.kitPath == AppSettings.kitPath
        else { throw FlowError.upgradePreviewChanged }
        guard cliStatus == .ready else {
            return .failed(branch: nil, error: PresentedError(CLIFailure.unavailable(cliStatus)))
        }

        let target = reviewed.target
        let record: UpgradeBranchRecord
        do {
            guard let (before, _) = try? await readUpgradeContext(ref), before == reviewed.context else {
                throw FlowError.upgradePreviewChanged
            }
            let branch = BranchNamer.upgradeBranch(label: target.label, existing: try await git.localBranches(ref.url))
            guard let current = try? await checkUpgrade(ref.url, target: target),
                (try? await kit.isCurrentUpgradeTarget(target, from: before.state.commit)) == true,
                let (after, status) = try? await readUpgradeContext(ref), reviewed.matches(context: after, report: current)
            else { throw FlowError.upgradePreviewChanged }
            try await git.createAndSwitch(ref.url, branch: branch)
            record = UpgradeBranchRecord(branch: branch, previous: after.branch, startedDirty: status.dirtyCount > 0)
        } catch FlowError.upgradePreviewChanged {
            throw FlowError.upgradePreviewChanged
        } catch {
            return .failed(branch: nil, error: PresentedError(error))
        }
        upgradeBranches[ref.id] = record

        let outcome = try await applyUpgrade(
            project, ref: ref, snapshot: snapshot, reviewed: reviewed, record: record, backup: backup)
        await refresh(project, force: true)
        return outcome
    }

    private static func failure(_ precondition: UpgradePrecondition) -> UpgradeOutcome {
        let reason = precondition.reason ?? FlowError.projectUnknown.localizedDescription
        return .failed(branch: nil, error: PresentedError(message: reason))
    }

    private func applyUpgrade(
        _ project: Project, ref: ProjectRef, snapshot: ProjectSnapshot, reviewed: UpgradeReview,
        record: UpgradeBranchRecord, backup: Bool
    ) async throws -> UpgradeOutcome {
        let cli = cli
        let git = git
        let kit = kit
        let target = reviewed.target
        let context = reviewed.context
        let url = context.url
        let branch = record.branch
        let previousBackups = record.startedDirty && backup ? try? await cli.backups(project: url) : nil
        let previousFingerprint = record.startedDirty ? try? await git.fingerprint(url) : nil
        do {
            let force = reviewed.report.unsaved?.risky.isEmpty == false
            let report = try await limiter.run {
                // Branch switching or waiting for a render slot may have allowed another edit.
                guard (try? await kit.isCurrentUpgradeTarget(target, from: context.state.commit)) == true,
                    (try? await git.status(url).branch) == branch,
                    (try? await git.fingerprint(url)) == context.fingerprint,
                    ProjectClassifier.classify(url) == .kitV3(context.state),
                    await self.isCurrentUpgradeProject(ref, kitPath: context.kitPath)
                else { throw FlowError.upgradePreviewChanged }
                return try await cli.upgrade(
                    project: url, to: target.commit, source: .local, check: false, force: force, backup: backup)
            }
            if report.upToDate == true {
                return await abandonUpToDate(project, record: record)
            }
            if record.startedDirty {
                upgradeBranches[context.id] = UpgradeBranchRecord(
                    branch: branch, previous: record.previous, keepsChanges: !report.applied && report.backup == nil,
                    startedDirty: true, backupName: report.backup?.name)
            }
            guard report.applied, report.to == target.commit else {
                return .failed(branch: branch, error: PresentedError(message: "The nuxt-saas CLI did not apply the reviewed upgrade."))
            }
            let input = UpgradePromptInput(
                projectName: ProjectRow(project: project, snapshot: snapshot).name,
                fromLabel: snapshot.versionLabel ?? String(context.state.commit.prefix(7)), toLabel: target.label,
                report: report, scripts: snapshot.package?.scripts ?? [])
            upgradeBranches[context.id] = nil
            return .applied(branch: branch, report: report, prompt: input)
        } catch FlowError.upgradePreviewChanged {
            // Apply never ran, so any new edits belong to the user. Never offer discard here.
            upgradeBranches[context.id] = UpgradeBranchRecord(
                branch: branch, previous: record.previous, keepsChanges: true, startedDirty: record.startedDirty)
            do {
                guard try await git.status(url).branch == branch else {
                    throw FlowError.rollbackRefused("The current branch changed. No project files were overwritten.")
                }
                try await git.switchBackKeepingChanges(url, branch: branch, returningTo: record.previous)
                upgradeBranches[context.id] = nil
            } catch {
                return .failed(branch: branch, error: PresentedError(error))
            }
            throw FlowError.upgradePreviewChanged
        } catch {
            if record.startedDirty, upgradeBranches[context.id] == record {
                await recordFailedDirtyUpgrade(
                    project, record: record, cli: cli, previousBackups: previousBackups, previousFingerprint: previousFingerprint)
            }
            return .failed(branch: branch, error: PresentedError(error))
        }
    }

    private func recordFailedDirtyUpgrade(
        _ project: Project, record: UpgradeBranchRecord, cli: NuxtSaasCLI,
        previousBackups: BackupList?, previousFingerprint: String?
    ) async {
        if let previousBackups, let current = try? await cli.backups(project: project.url),
            let backup = UpgradeRollback.interruptedBackup(previous: previousBackups, current: current)
        {
            upgradeBranches[project.id] = UpgradeBranchRecord(
                branch: record.branch, previous: record.previous, startedDirty: true, backupName: backup.name)
            return
        }
        if let previousFingerprint, (try? await git.fingerprint(project.url)) == previousFingerprint {
            upgradeBranches[project.id] = UpgradeBranchRecord(
                branch: record.branch, previous: record.previous, keepsChanges: true, startedDirty: true)
        }
    }

    /// Opens Terminal with Claude on the upgrade prompt (it says not to commit).
    func launchUpgradeResolution(_ project: Project, prompt: UpgradePromptInput) async throws {
        let file = try launcher.writePrompt(PromptBuilder.upgrade(prompt))
        try await launcher.openTerminal(at: project.url, command: .claudePrompt(file: file))
    }

    /// The paths with uncommitted changes right now, read from git, for telling the user what a
    /// discard would throw away. Nil when git cannot say.
    func uncommittedPaths(_ project: Project) async -> [String]? {
        try? await git.dirtyPaths(project.url)
    }

    /// The CLI found nothing to upgrade, so the new branch should be empty. Goes back to `previous` and
    /// deletes the branch without discarding anything. If a file appeared meanwhile it is the user's own
    /// work, so nothing is touched and the only way back offered is a plain switch that keeps it.
    private func abandonUpToDate(_ project: Project, record: UpgradeBranchRecord) async -> UpgradeOutcome {
        do {
            try await git.abandonBranch(project.url, branch: record.branch, returningTo: record.previous)
            upgradeBranches[project.id] = nil
            return Self.failure(.upToDate)
        } catch GitError.uncommittedChanges {
            upgradeBranches[project.id] = UpgradeBranchRecord(
                branch: record.branch, previous: record.previous, keepsChanges: true, startedDirty: record.startedDirty)
            let message = "The project is already up to date, but there are uncommitted changes. They are yours, so nothing was discarded."
            return .failed(branch: record.branch, error: PresentedError(message: message))
        } catch {
            return .failed(branch: record.branch, error: PresentedError(error))
        }
    }

    /// Switches back and deletes an app-created upgrade branch. Uses undo instead of discarding when
    /// the branch started dirty; if undo is blocked, leaves the branch and working tree where they are.
    func rollBackUpgrade(_ project: Project, branch: String, previous: String) async throws {
        let url = project.url
        do {
            let current = try await git.status(url).branch
            let record = upgradeBranches[project.id]
            switch UpgradeRollback.plan(record: record, branch: branch, previous: previous, current: current) {
            case .refuse(let reason):
                throw FlowError.rollbackRefused(reason)
            case .discardSwitchAndDelete:
                try await git.discardChanges(url)
                try await git.switchTo(url, branch: previous)
                try await git.deleteBranch(url, branch: branch)
            case .undoSwitchAndDelete:
                guard let backupName = record?.backupName else {
                    throw FlowError.rollbackRefused("No backup was found for this update. Your changes haven't been discarded.")
                }
                let cli = cli
                let result = try await limiter.run { try await cli.undo(project: url, check: false, backup: backupName) }
                guard result.restored else {
                    throw FlowError.rollbackRefused(result.blocked?.displayMessage ?? "The backup wasn't restored.")
                }
                // If switching fails, a retry only needs to switch and delete, not restore again.
                upgradeBranches[project.id] = UpgradeBranchRecord(
                    branch: branch, previous: previous, keepsChanges: true, startedDirty: true)
                try await git.switchBackKeepingChanges(url, branch: branch, returningTo: previous)
            case .switchKeepingChanges:
                try await git.switchBackKeepingChanges(url, branch: branch, returningTo: previous)
            case .deleteOnly:
                try await git.deleteBranch(url, branch: branch)
            }
            upgradeBranches[project.id] = nil
        } catch {
            await refresh(project, force: true)
            throw error
        }
        await refresh(project, force: true)
    }

    // MARK: Migration

    /// The migration prompt for the chosen folder name and modules. Creates the temporary directory the
    /// prompt tells Claude to generate the fresh kit project into.
    func migrationPrompt(_ project: Project, folderName: String, selected: [String]) throws -> String {
        guard let snapshot = snapshots[project.id] else { throw FlowError.projectUnknown }
        guard !snapshot.isKitSource, let source = Self.migrationSource(of: snapshot.kind) else { throw FlowError.notMigratable }
        let folder = folderName.trimmingCharacters(in: .whitespacesAndNewlines)
        if let problem = MigrationFolderName.problem(with: folder) { throw FlowError.invalidFolderName(problem) }

        let directory = try MigrationWorkspace.create()
        let input = MigrationPromptInput(
            projectName: ProjectRow(project: project, snapshot: snapshot).name, folderName: folder, source: source,
            catalogue: catalogue, selected: catalogue.filter { !$0.internal }.map(\.id).filter(selected.contains), temporaryDirectory: directory)
        return PromptBuilder.migration(input)
    }

    func launchMigration(_ project: Project, folderName: String, selected: [String]) async throws {
        let prompt = try migrationPrompt(project, folderName: folderName, selected: selected)
        let file = try launcher.writePrompt(prompt)
        try await launcher.openTerminal(at: project.url, command: .claudePrompt(file: file))
    }

    func copyMigrationPrompt(_ project: Project, folderName: String, selected: [String]) throws {
        let prompt = try migrationPrompt(project, folderName: folderName, selected: selected)
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(prompt, forType: .string)
    }

    private static func migrationSource(of kind: ProjectKind) -> MigrationSource? {
        switch kind {
        case .kitLegacy: .legacy
        case .nuxt: .nuxt
        case .other: .other
        case .kitV3, .missing, .invalidState: nil
        }
    }
}
