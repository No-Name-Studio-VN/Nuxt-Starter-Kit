public enum BranchNamer {
    public static let migrationBranch = "kit-migration"

    private static let upgradePrefix = "kit-upgrade/"

    /// `kit-upgrade/<label>` with the label reduced to characters git accepts,
    /// and `-2`, `-3`… appended until the name is not in `existing`.
    public static func upgradeBranch(label: String, existing: Set<String>) -> String {
        let base = upgradePrefix + sanitise(label)
        guard existing.contains(base) else { return base }
        var suffix = 2
        while existing.contains("\(base)-\(suffix)") {
            suffix += 1
        }
        return "\(base)-\(suffix)"
    }

    private static func sanitise(_ label: String) -> String {
        var result = ""
        for character in label {
            let allowed = character.isASCII && (character.isLetter || character.isNumber || character == "." || character == "-" || character == "_")
            if allowed {
                result.append(character)
            } else if result.last != "-" {
                result.append("-")
            }
        }
        // Git rejects "..", a trailing ".lock" and leading or trailing dots.
        while result.contains("..") {
            result = result.replacing("..", with: ".")
        }
        result = result.replacing(".lock", with: "-lock")
        let trimmed = trim(result, of: ["-", "."])
        return trimmed.isEmpty ? "update" : trimmed
    }

    private static func trim(_ value: String, of characters: Set<Character>) -> String {
        var slice = value[...]
        while let first = slice.first, characters.contains(first) { slice = slice.dropFirst() }
        while let last = slice.last, characters.contains(last) { slice = slice.dropLast() }
        return String(slice)
    }
}
