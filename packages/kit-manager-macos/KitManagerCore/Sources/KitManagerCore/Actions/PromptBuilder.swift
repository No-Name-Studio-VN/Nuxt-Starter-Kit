import Foundation

public enum PromptBuilder {
    public static let legacyGuidance =
        "This project was created by create-nuxt-saas 2.x, which this version cannot manage. Generate a new project with `npm create nuxt-saas@latest` and move your code across."

    /// How many changed files a prompt lists; the rest are summarised so `claude "$(cat file)"` stays small.
    public static let maxListedChanges = 200

    public static func upgrade(_ input: UpgradePromptInput) -> String {
        var lines = [
            "# Upgrade \(input.projectName) to the latest kit",
            "",
            "This project was upgraded from kit \(input.fromLabel) → \(input.toLabel). The changes are already applied to the working tree.",
            "",
        ]
        lines += resolutionBody(report: input.report, scripts: input.scripts)
        return lines.joined(separator: "\n") + "\n"
    }

    /// For conflicts left behind by adding or removing modules, which is not a kit upgrade.
    public static func moduleChange(_ input: ModuleChangePromptInput) -> String {
        let verb = input.action == .add ? "adding" : "removing"
        let modules = input.moduleIDs.joined(separator: ", ")
        var lines = [
            "# Resolve the conflicts from \(verb) \(modules) in \(input.projectName)",
            "",
            "The nuxt-saas CLI just changed this project's modules by \(verb) \(modules). The project stays on kit \(input.versionLabel). The changes are already applied to the working tree.",
            "",
        ]
        lines += resolutionBody(report: input.report, scripts: input.scripts)
        return lines.joined(separator: "\n") + "\n"
    }

    /// The change list, conflicts, follow-ups and instructions that every applied transition shares.
    private static func resolutionBody(report: TransitionReport, scripts: Set<String>) -> [String] {
        var changes = report.changes.prefix(maxListedChanges).map { "- \($0.kind.rawValue) \($0.path)" }
        if report.changes.count > maxListedChanges {
            changes.append("- …and \(report.changes.count - maxListedChanges) more")
        }
        let conflicts = report.conflicts.map { "- \($0)" }
        let followUps = report.followUps.map { "- \($0)" }

        var lines = [
            "## Changes",
            "",
        ]
        lines += changes.isEmpty ? ["- none"] : changes
        lines += [
            "",
            "## Conflicts",
            "",
            "Files with conflicts:",
            "",
        ]
        lines += conflicts.isEmpty ? ["- none"] : conflicts
        lines += [
            "",
            "Conflict markers look like this:",
            "",
            "```",
            "<<<<<<< yours",
            "(this project's version)",
            "||||||| kit (old)",
            "(the kit's previous version)",
            "=======",
            "(the kit's new version)",
            ">>>>>>> kit (new)",
            "```",
            "",
            "## Follow-ups",
            "",
        ]
        lines += followUps.isEmpty ? ["- none"] : followUps
        lines += [
            "",
            "## Instructions",
            "",
            "1. Resolve every conflict, keeping this project's intent.",
            "2. Run the follow-ups.",
        ]
        var step = 3
        if let checks = checkInstruction(scripts: scripts) {
            lines.append("\(step). \(checks)")
            step += 1
        }
        lines.append("\(step). Never hand-edit generated migration SQL or snapshots.")
        lines.append("\(step + 1). Do not commit; leave the changes for review.")
        return lines
    }

    public static func migration(_ input: MigrationPromptInput) -> String {
        let target = quotedIfNeeded(input.temporaryDirectory.appending(path: input.folderName).path)
        var create = "npm create nuxt-saas@latest \(target) -- --yes"
        if !input.selected.isEmpty {
            create += " --modules \(input.selected.joined(separator: ","))"
        }
        create += " --no-git"

        var lines = [
            "# Migrate \(input.projectName) to the Nuxt SaaS kit",
            "",
        ]
        switch input.source {
        case .legacy:
            lines += [
                "> \(legacyGuidance)",
                "",
            ]
        case .nuxt:
            lines += ["This is a plain Nuxt project that was not created from the kit.", ""]
        case .other:
            lines += ["This project was not created from the kit.", ""]
        }
        lines += [
            "## Steps",
            "",
            "1. Work on a new git branch named `\(BranchNamer.migrationBranch)`.",
            "2. Generate a fresh kit project with:",
            "",
            "   ```",
            "   \(create)",
            "   ```",
            "",
            "   The generated folder name must stay `\(input.folderName)`, because the kit records it as the project name in `.nuxt-saas.json`, `package.json` and `wrangler.jsonc`.",
            "3. Port this project's pages, components, server code, schemas and content into the kit's structure and conventions (see below).",
            "4. Bring the generated files, including `.nuxt-saas.json`, into this repository so its git history is kept.",
            "5. Run install, `db:generate`, typecheck and tests.",
            "6. Do not commit; leave the changes uncommitted for review.",
            "",
            "## Conventions",
            "",
            "- Code is split between the base app and layers; put module code in its layer.",
            "- Server APIs respond through `success()`, passing the data, or throw `apiError`; never return `{ success: true }` or `{ success: false }` objects.",
            "- Schemas live in the schemas directory and types in the types directory; do not define them inline on the client or server.",
            "- Never hand-edit generated migration SQL or snapshots.",
            "",
            "## Module catalogue",
            "",
        ]
        let modules = input.catalogue.filter { !$0.internal }
        lines += modules.map { "- \($0.id) — \($0.title): \($0.description)" }
        return lines.joined(separator: "\n") + "\n"
    }

    /// "Then run `pnpm typecheck` and `pnpm test`", limited to the scripts the project has.
    private static func checkInstruction(scripts: Set<String>) -> String? {
        let commands = ["typecheck", "test"].filter { scripts.contains($0) }.map { "`pnpm \($0)`" }
        guard !commands.isEmpty else { return nil }
        return "Then run \(commands.joined(separator: " and "))."
    }

    /// Quotes the path only when a shell would split or expand it, so ordinary paths stay readable.
    private static func quotedIfNeeded(_ path: String) -> String {
        let plain = path.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || "/._-".contains($0)) }
        return plain ? path : shellQuote(path)
    }
}
