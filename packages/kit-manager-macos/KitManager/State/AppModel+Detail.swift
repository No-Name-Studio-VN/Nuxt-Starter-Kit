import Foundation
import KitManagerCore

/// Actions behind the project detail page.
extension AppModel {
    // MARK: Modules

    /// The `--check` plan for adding or removing modules. Never writes.
    func previewModuleChange(_ project: Project, action: ModuleAction, ids: [String]) async -> Result<TransitionReport, any Error> {
        await changeModules(project, action: action, ids: ids, check: true)
    }

    /// Applies the change. Refuses on a dirty tree (checked against git right now, not the last
    /// snapshot) and never forces. The project is refreshed afterwards either way.
    func applyModuleChange(_ project: Project, action: ModuleAction, ids: [String]) async -> Result<TransitionReport, any Error> {
        do {
            guard try await git.status(project.url).dirtyCount == 0 else { return .failure(ModuleChangeError.dirtyTree) }
        } catch {
            return .failure(error)
        }
        let result = await changeModules(project, action: action, ids: ids, check: false)
        await refresh(project, force: true)
        return result
    }

    private func changeModules(
        _ project: Project, action: ModuleAction, ids: [String], check: Bool
    ) async -> Result<TransitionReport, any Error> {
        let cli = cli
        let url = project.url
        do {
            return .success(try await limiter.run { try await cli.changeModules(action, ids: ids, project: url, check: check) })
        } catch {
            return .failure(error)
        }
    }

    /// Writes an upgrade-style prompt from an applied module change and opens Claude on it in Terminal.
    func resolveModuleConflicts(
        _ project: Project, report: TransitionReport, action: ModuleAction, ids: [String]
    ) async throws {
        guard report.applied else { throw ModuleChangeError.notApplied }
        guard let snapshot = snapshots[project.id] else { throw ModuleChangeError.projectUnknown }
        let label = snapshot.versionLabel ?? String(report.to.prefix(7))
        let verb = action == .add ? "adding" : "removing"
        let input = UpgradePromptInput(
            projectName: ProjectRow(project: project, snapshot: snapshot).name,
            fromLabel: label, toLabel: "\(label), after \(verb) \(ids.joined(separator: ", "))",
            report: report, scripts: snapshot.package?.scripts ?? [])
        let file = try launcher.writePrompt(PromptBuilder.upgrade(input))
        try await launcher.openTerminal(at: project.url, command: .claudePrompt(file: file))
    }

    // MARK: Files

    /// Opens a file of the project in VS Code. `relativePath` comes from the CLI; anything that would
    /// leave the project folder is refused.
    func openInVSCode(_ project: Project, relativePath: String) async {
        let root = project.url.standardizedFileURL
        let file = root.appending(path: relativePath).standardizedFileURL
        guard file.path.hasPrefix(root.path + "/") else {
            errorMessage = "That path is outside the project."
            return
        }
        await perform { try await launcher.openInVSCode(file) }
    }

    // MARK: Deployment

    /// Saves the production URL override; an empty value clears it. Returns false when the text is
    /// not an http(s) URL, in which case nothing is saved.
    @discardableResult
    func setProductionURL(_ project: Project, to text: String) -> Bool {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            project.productionURL = nil
        } else {
            guard ProductionURL.resolve(wrangler: nil, override: trimmed) != nil else { return false }
            project.productionURL = trimmed
        }
        save()
        Task { await refresh(project) }
        return true
    }

    /// An explicit site check; nothing happens when the project has no production URL.
    func checkHealth(_ project: Project) async {
        guard let url = ProductionURL.resolve(wrangler: snapshots[project.id]?.wrangler, override: project.productionURL)
        else { return }
        let result = await health.check(url)
        update(project.id) { $0.health = result }
    }
}
