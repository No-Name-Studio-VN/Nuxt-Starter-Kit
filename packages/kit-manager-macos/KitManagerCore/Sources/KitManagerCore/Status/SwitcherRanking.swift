import Foundation

/// The ⌘K switcher's fuzzy filter.
public enum SwitcherRanking {
    /// IDs of the candidates whose name or path contains `query` as a subsequence (case
    /// insensitive), best first: the longest contiguous run of the query wins, then a match in the
    /// name over one only in the path, then the shorter name. Equal scores keep the given order.
    /// An empty query keeps every candidate in order.
    public static func rank(query: String, candidates: [SwitcherCandidate]) -> [UUID] {
        let needle = Array(query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
        guard !needle.isEmpty else { return candidates.map(\.id) }

        struct Scored {
            let id: UUID
            let run: Int
            let inName: Bool
            let nameLength: Int
            let position: Int
        }
        var scored: [Scored] = []
        for (position, candidate) in candidates.enumerated() {
            let nameRun = run(of: needle, in: Array(candidate.name.lowercased()))
            let pathRun = run(of: needle, in: Array(candidate.path.lowercased()))
            guard nameRun != nil || pathRun != nil else { continue }
            scored.append(
                Scored(
                    id: candidate.id, run: max(nameRun ?? 0, pathRun ?? 0), inName: nameRun != nil,
                    nameLength: candidate.name.count, position: position))
        }
        return scored.sorted { lhs, rhs in
            if lhs.run != rhs.run { return lhs.run > rhs.run }
            if lhs.inName != rhs.inName { return lhs.inName }
            if lhs.nameLength != rhs.nameLength { return lhs.nameLength < rhs.nameLength }
            return lhs.position < rhs.position
        }.map(\.id)
    }

    /// The longest stretch of `needle` that appears unbroken in `text`, or nil when `needle` is not
    /// a subsequence of `text` at all.
    private static func run(of needle: [Character], in text: [Character]) -> Int? {
        var next = needle.startIndex
        for character in text where next < needle.endIndex && character == needle[next] {
            next += 1
        }
        guard next == needle.endIndex else { return nil }

        // Longest common substring, one row at a time.
        var best = 0
        var previous = [Int](repeating: 0, count: text.count + 1)
        for query in needle {
            var row = [Int](repeating: 0, count: text.count + 1)
            for (index, character) in text.enumerated() where character == query {
                row[index + 1] = previous[index] + 1
                best = max(best, row[index + 1])
            }
            previous = row
        }
        return best
    }
}
