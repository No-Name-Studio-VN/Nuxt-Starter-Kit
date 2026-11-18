import Foundation

/// Parser for `git status --porcelain=v2 [--branch] -z` output.
struct PorcelainV2: Equatable {
    var oid: String?
    var branch: String?
    var ahead: Int?
    var behind: Int?
    /// Paths of changed, unmerged and untracked entries (new path for renames). Ignored entries are skipped.
    var paths: [String] = []

    init(_ output: Data) {
        let tokens = String(decoding: output, as: UTF8.self).split(separator: "\0", omittingEmptySubsequences: true)
        var index = tokens.startIndex
        while index < tokens.endIndex {
            let token = tokens[index]
            index = tokens.index(after: index)
            if token.hasPrefix("# ") {
                parseHeader(token)
            } else if token.hasPrefix("1 ") {
                appendPath(token, leadingFields: 8)
            } else if token.hasPrefix("2 ") {
                appendPath(token, leadingFields: 9)
                // A rename or copy is followed by its original path as a separate NUL field.
                if index < tokens.endIndex { index = tokens.index(after: index) }
            } else if token.hasPrefix("u ") {
                appendPath(token, leadingFields: 10)
            } else if token.hasPrefix("? ") {
                paths.append(String(token.dropFirst(2)))
            }
        }
    }

    private mutating func parseHeader(_ token: Substring) {
        let parts = token.dropFirst(2).split(separator: " ", maxSplits: 1, omittingEmptySubsequences: false)
        guard parts.count == 2 else { return }
        let value = String(parts[1])
        switch parts[0] {
        case "branch.oid":
            oid = value == "(initial)" ? nil : value
        case "branch.head":
            branch = value == "(detached)" ? nil : value
        case "branch.ab":
            let counts = value.split(separator: " ")
            guard counts.count == 2, let plus = Int(counts[0].dropFirst()), let minus = Int(counts[1].dropFirst()) else { return }
            ahead = plus
            behind = minus
        default:
            break
        }
    }

    private mutating func appendPath(_ token: Substring, leadingFields: Int) {
        let fields = token.split(separator: " ", maxSplits: leadingFields, omittingEmptySubsequences: false)
        guard fields.count == leadingFields + 1 else { return }
        paths.append(String(fields[leadingFields]))
    }
}
