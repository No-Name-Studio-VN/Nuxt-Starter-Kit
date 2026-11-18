/// How much of one layer's scored files the project has edited or deleted.
public struct LayerCustomisation: Sendable, Equatable, Identifiable {
    public let layer: String
    public let scored: Int
    public let edited: Int
    public let deleted: Int

    public init(layer: String, scored: Int, edited: Int, deleted: Int) {
        self.layer = layer
        self.scored = scored
        self.edited = edited
        self.deleted = deleted
    }

    public var id: String { layer }
    public var changed: Int { edited + deleted }
    public var score: Double { scored == 0 ? 0 : Double(changed) / Double(scored) }
}

public enum Customisation {
    /// A scored file is neither protected nor one projects are meant to edit; the same rule as
    /// the CLI's `summary.scored`.
    public static func isScored(_ file: InspectFile) -> Bool {
        file.status != .protected && !file.expected
    }

    /// Per-layer counts over scored files, `base` first then alphabetical. Layers with nothing scored are left out.
    public static func layers(of report: InspectReport) -> [LayerCustomisation] {
        var counts: [String: (scored: Int, edited: Int, deleted: Int)] = [:]
        for file in report.files where isScored(file) {
            var entry = counts[file.layer, default: (0, 0, 0)]
            entry.scored += 1
            switch file.status {
            case .edited: entry.edited += 1
            case .deleted: entry.deleted += 1
            case .unchanged, .protected: break
            }
            counts[file.layer] = entry
        }
        return counts
            .map { LayerCustomisation(layer: $0.key, scored: $0.value.scored, edited: $0.value.edited, deleted: $0.value.deleted) }
            .sorted { lhs, rhs in
                if lhs.layer == ModuleMapping.base { return rhs.layer != ModuleMapping.base }
                if rhs.layer == ModuleMapping.base { return false }
                return lhs.layer < rhs.layer
            }
    }

    /// Edited and deleted files by path. Files that projects are meant to edit are left out unless `includeExpected`.
    public static func changedFiles(of report: InspectReport, includeExpected: Bool = false) -> [InspectFile] {
        report.files
            .filter { file in
                (file.status == .edited || file.status == .deleted) && (includeExpected || !file.expected)
            }
            .sorted { $0.path < $1.path }
    }
}
