import Foundation

/// A path pattern with tinyglobby / picomatch semantics, as the CLI applies them to kit.json
/// `exclude` and module `rootFiles`. Dot files match, `**` spans zero or more segments, `*` and `?`
/// never cross `/`, and a pattern is anchored at the root: `CLAUDE.md` does not match `docs/CLAUDE.md`.
public struct Glob: Sendable, Hashable {
    private let segments: [String]

    public init(_ pattern: String) {
        segments = pattern.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
    }

    public func matches(_ path: String) -> Bool {
        let parts = path.split(separator: "/", omittingEmptySubsequences: true).map(String.init)
        return Self.match(segments[...], parts[...])
    }

    private static func match(_ pattern: ArraySlice<String>, _ path: ArraySlice<String>) -> Bool {
        guard let head = pattern.first else { return path.isEmpty }
        let rest = pattern.dropFirst()
        if head == "**" {
            // Zero segments, or consume one and keep the `**`.
            if match(rest, path) { return true }
            guard !path.isEmpty else { return false }
            return match(pattern, path.dropFirst())
        }
        guard let first = path.first, matchSegment(Array(head), Array(first)) else { return false }
        return match(rest, path.dropFirst())
    }

    /// `*` matches any run of characters, `?` exactly one; `**` inside a segment behaves like `*`.
    private static func matchSegment(_ pattern: [Character], _ text: [Character]) -> Bool {
        var p = 0
        var t = 0
        var starIndex: Int?
        var resumeText = 0
        while t < text.count {
            if p < pattern.count, pattern[p] == "*" {
                starIndex = p
                resumeText = t
                p += 1
            } else if p < pattern.count, pattern[p] == "?" || pattern[p] == text[t] {
                p += 1
                t += 1
            } else if let star = starIndex {
                // Backtrack: let the last `*` swallow one more character.
                p = star + 1
                resumeText += 1
                t = resumeText
            } else {
                return false
            }
        }
        while p < pattern.count, pattern[p] == "*" { p += 1 }
        return p == pattern.count
    }
}
