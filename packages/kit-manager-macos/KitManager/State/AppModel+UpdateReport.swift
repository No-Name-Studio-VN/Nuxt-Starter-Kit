import Foundation
import KitManagerCore

extension AppModel {
    func checkBackup(_ project: Project, named backup: String) async throws -> UndoReport {
        let cli = cli
        let url = project.url
        return try await limiter.run { try await cli.undo(project: url, check: true, backup: backup) }
    }

    func restoreBackup(_ project: Project, named backup: String) async throws {
        let cli = cli
        let url = project.url
        let report = try await limiter.run { try await cli.undo(project: url, check: false, backup: backup) }
        guard report.restored else {
            throw UpdateReportError.actionNotApplied(report.blocked?.displayMessage ?? "The backup wasn't restored.")
        }
        // The backup is used up, so an open upgrade branch only needs a switch back now.
        if let record = upgradeBranches[project.id], record.backupName == backup {
            upgradeBranches[project.id] = UpgradeBranchRecord(
                branch: record.branch, previous: record.previous, keepsChanges: true, startedDirty: true)
        }
        await refresh(project, force: true)
    }

    func updateDecisions(_ project: Project) async throws -> [Decision] {
        let cli = cli
        let url = project.url
        return try await limiter.run { try await cli.decisions(project: url).decisions }
    }

    func resolveUpdateDecision(
        _ project: Project, path: String, action: ResolutionAction, decline: Bool
    ) async throws -> [Decision] {
        let cli = cli
        let url = project.url
        let report = try await limiter.run {
            try await cli.resolve(project: url, path: path, action: action, decline: decline)
        }
        guard report.resolved == ResolvedDecision(path: path, action: action) else {
            throw UpdateReportError.actionNotApplied("That decision wasn't saved.")
        }
        return report.decisions
    }

    func askAboutFeatureAgain(_ project: Project, id: String) async throws -> [String] {
        let cli = cli
        let url = project.url
        let report = try await limiter.run { try await cli.decline(project: url, ids: [id], revert: true) }
        await refresh(project, force: true)
        return report.declined
    }
}

extension TransitionReport {
    /// A preview is permission to force only for the paths and kinds of risk it showed.
    func checkReviewedRisk(against current: TransitionReport) throws {
        guard from == current.from, to == current.to, let unsaved, let currentUnsaved = current.unsaved,
            Set(currentUnsaved.risky).isSubset(of: Set(unsaved.risky))
        else { throw UpdateReportError.previewChanged }
    }
}

enum UpdateReportError: LocalizedError {
    case previewChanged
    case actionNotApplied(String)

    var errorDescription: String? {
        switch self {
        case .previewChanged: "The project changed since this preview. Preview it again to review the files at risk."
        case .actionNotApplied(let message): message
        }
    }
}
