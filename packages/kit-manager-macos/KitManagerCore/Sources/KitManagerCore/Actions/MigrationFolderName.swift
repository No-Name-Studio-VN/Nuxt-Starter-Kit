import Foundation

/// The folder name a migrated project is generated under. The kit records it as the project's name.
public enum MigrationFolderName {
    /// The `package.json` name (without a scope), otherwise the project's own folder name.
    public static func defaultName(packageName: String?, folderName: String) -> String {
        let name = packageName?.split(separator: "/", omittingEmptySubsequences: true).last
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) } ?? ""
        return name.isEmpty || name == "." || name == ".." ? folderName : name
    }

    /// Why `name` cannot be used; nil when it can.
    public static func problem(with name: String) -> String? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "Enter a folder name." }
        if trimmed == "." || trimmed == ".." { return "A folder name cannot be . or .." }
        if trimmed.contains("/") || trimmed.contains("\0") { return "A folder name cannot contain /." }
        return nil
    }
}
