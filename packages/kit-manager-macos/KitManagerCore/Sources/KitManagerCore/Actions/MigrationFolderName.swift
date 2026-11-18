import Foundation

/// The folder name a migrated project is generated under. The kit records it as the project's name,
/// and it ends up in an `npm create` command line, so it follows npm's package-name rules.
public enum MigrationFolderName {
    public static let maxLength = 214
    private static let fallback = "project"

    /// A valid name derived from the `package.json` name (without a scope), otherwise from the project's folder name.
    public static func defaultName(packageName: String?, folderName: String) -> String {
        let package = packageName?.split(separator: "/", omittingEmptySubsequences: true).last.map(String.init) ?? ""
        for candidate in [package, folderName] {
            let name = sanitised(candidate)
            if !name.isEmpty { return name }
        }
        return fallback
    }

    /// Why `name` cannot be used; nil when it can. Surrounding whitespace is ignored.
    public static func problem(with name: String) -> String? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return "Enter a folder name." }
        if trimmed.count > maxLength { return "Use at most \(maxLength) characters." }
        if trimmed.first == "." || trimmed.first == "_" { return "A folder name cannot start with . or _" }
        if !trimmed.allSatisfy(isAllowed) { return "Use only lowercase letters, digits, - _ and ." }
        return nil
    }

    private static func isAllowed(_ character: Character) -> Bool {
        guard character.isASCII else { return false }
        return character.isLowercase || character.isNumber || character == "-" || character == "_" || character == "."
    }

    /// Lowercases, turns every other character into `-`, and trims what npm does not allow at the edges.
    private static func sanitised(_ text: String) -> String {
        var result = ""
        for character in text.lowercased() {
            if isAllowed(character) {
                result.append(character)
            } else if result.last != "-" {
                result.append("-")
            }
        }
        var slice = result[...]
        while let first = slice.first, first == "." || first == "_" || first == "-" { slice = slice.dropFirst() }
        while let last = slice.last, last == "-" || last == "." { slice = slice.dropLast() }
        return String(slice.prefix(maxLength))
    }
}
