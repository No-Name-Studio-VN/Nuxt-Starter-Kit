public struct UpgradePromptInput: Sendable {
    public let projectName: String
    public let fromLabel: String
    public let toLabel: String
    public let report: TransitionReport
    /// The project's `package.json` script names, to decide which checks the prompt asks for.
    public let scripts: Set<String>

    public init(projectName: String, fromLabel: String, toLabel: String, report: TransitionReport, scripts: Set<String>) {
        self.projectName = projectName
        self.fromLabel = fromLabel
        self.toLabel = toLabel
        self.report = report
        self.scripts = scripts
    }
}
