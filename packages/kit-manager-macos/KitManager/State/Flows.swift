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

    /// What the upgrade branch would be called right now.
    func proposedUpgradeBranch(for project: Project) async -> String? {
        guard let label = targetLabel else { return nil }
        guard let existing = try? await git.localBranches(project.url) else { return nil }
        return BranchNamer.upgradeBranch(label: label, existing: existing)
    }

    /// `v3.1.0 +2` for the latest main, the short commit when git cannot describe it.
    var targetLabel: String? {
        latestLabel ?? latestMain.map { String($0.prefix(7)) }
    }

    /// Switches to a new `kit-upgrade/…` branch, applies the upgrade onto it, and (with Claude) opens
    /// Terminal on a prompt. Record whether it started dirty so rollback knows to use a backup.
    func runUpgrade(_ project: Project, withClaude: Bool, reviewed: TransitionReport, backup: Bool) async -> UpgradeOutcome {
        let precondition = upgradePrecondition(project)
        guard precondition == .ready, let snapshot = snapshots[project.id], let target = latestMain,
            let label = targetLabel, let state = snapshot.kitState
        else {
            return Self.failure(precondition)
        }
        guard cliStatus == .ready else {
            return .failed(branch: nil, error: PresentedError(CLIFailure.unavailable(cliStatus)))
        }

        guard reviewed.to == target else {
            return .failed(branch: nil, error: PresentedError(UpdateReportError.previewChanged))
        }
        let url = project.url
        let cli = cli
        let force = reviewed.unsaved?.risky.isEmpty == false
        let record: UpgradeBranchRecord
        do {
            if force {
                try await limiter.run {
                    let current = try await cli.upgrade(project: url, to: target, source: .local, check: true)
                    try reviewed.checkReviewedRisk(against: current)
                }
            }
            let status = try await git.status(url)
            guard let current = status.branch else { return Self.failure(.noBranch) }
            let branch = BranchNamer.upgradeBranch(label: label, existing: try await git.localBranches(url))
            try await git.createAndSwitch(url, branch: branch)
            record = UpgradeBranchRecord(branch: branch, previous: current, startedDirty: status.dirtyCount > 0)
        } catch {
            return .failed(branch: nil, error: PresentedError(error))
        }
        upgradeBranches[project.id] = record

        let outcome = await applyUpgrade(
            project, snapshot: snapshot, state: state, target: target, targetLabel: label,
            record: record, withClaude: withClaude, force: force, backup: backup)
        await refresh(project, force: true)
        return outcome
    }

    private static func failure(_ precondition: UpgradePrecondition) -> UpgradeOutcome {
        let reason = precondition.reason ?? FlowError.projectUnknown.localizedDescription
        return .failed(branch: nil, error: PresentedError(message: reason))
    }

    private func applyUpgrade(
        _ project: Project, snapshot: ProjectSnapshot, state: KitState, target: String, targetLabel: String,
        record: UpgradeBranchRecord, withClaude: Bool, force: Bool, backup: Bool
    ) async -> UpgradeOutcome {
        let cli = cli
        let url = project.url
        let branch = record.branch
        let previousBackups = record.startedDirty && backup ? try? await cli.backups(project: url) : nil
        let previousFingerprint = record.startedDirty ? try? await git.fingerprint(url) : nil
        do {
            let report = try await limiter.run {
                try await cli.upgrade(project: url, to: target, source: .local, check: false, force: force, backup: backup)
            }
            if report.upToDate == true {
                return await abandonUpToDate(project, record: record)
            }
            if record.startedDirty {
                upgradeBranches[project.id] = UpgradeBranchRecord(
                    branch: branch, previous: record.previous, keepsChanges: !report.applied && report.backup == nil,
                    startedDirty: true, backupName: report.backup?.name)
            }
            guard report.applied else {
                return .failed(branch: branch, error: PresentedError(message: "The nuxt-saas CLI did not apply the update."))
            }
            let input = UpgradePromptInput(
                projectName: ProjectRow(project: project, snapshot: snapshot).name,
                fromLabel: snapshot.versionLabel ?? String(state.commit.prefix(7)), toLabel: targetLabel,
                report: report, scripts: snapshot.package?.scripts ?? [])
            guard withClaude else {
                upgradeBranches[project.id] = nil
                return .applied(branch: branch, report: report, prompt: input)
            }
            try await launchUpgradeResolution(project, prompt: input)
            upgradeBranches[project.id] = nil
            return .launched(branch: branch)
        } catch {
            if record.startedDirty, upgradeBranches[project.id] == record {
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
