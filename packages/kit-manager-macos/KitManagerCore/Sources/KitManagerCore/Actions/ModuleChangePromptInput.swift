public struct ModuleChangePromptInput: Sendable {
    public let projectName: String
    /// The kit version the project is on; a module change does not move it.
    public let versionLabel: String
    public let action: ModuleAction
    public let moduleIDs: [String]
    public let report: TransitionReport
    /// The project's `package.json` script names, to decide which checks the prompt asks for.
    public let scripts: Set<String>

    public init(
        projectName: String, versionLabel: String, action: ModuleAction, moduleIDs: [String],
        report: TransitionReport, scripts: Set<String>
    ) {
        self.projectName = projectName
        self.versionLabel = versionLabel
        self.action = action
        self.moduleIDs = moduleIDs
        self.report = report
        self.scripts = scripts
    }
}
