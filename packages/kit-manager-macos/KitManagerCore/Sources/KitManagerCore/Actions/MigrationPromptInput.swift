import Foundation

public struct MigrationPromptInput: Sendable {
    public let projectName: String
    /// The name the generated project's folder must carry; the kit records it as the project identity.
    public let folderName: String
    public let source: MigrationSource
    public let catalogue: [KitModuleInfo]
    public let selected: [String]
    /// Directory the app created for the fresh kit project to be generated into.
    public let temporaryDirectory: URL

    public init(
        projectName: String, folderName: String, source: MigrationSource, catalogue: [KitModuleInfo],
        selected: [String], temporaryDirectory: URL
    ) {
        self.projectName = projectName
        self.folderName = folderName
        self.source = source
        self.catalogue = catalogue
        self.selected = selected
        self.temporaryDirectory = temporaryDirectory
    }
}
