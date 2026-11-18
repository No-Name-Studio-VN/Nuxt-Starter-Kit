public enum ProjectStatus: Sendable, Equatable {
    case missing
    case invalid(String)
    case needsMigration(MigrationSource)
    case unresolvedConflicts(Int)
    case otherTemplate
    case commitNotOnMain(shortSHA: String)
    case upToDate
    case behind(Int, PreviewSummary?)
    case checking

    /// Picks the first case that applies, in the order declared above.
    public init(snapshot: ProjectSnapshot) {
        switch snapshot.kind {
        case .missing:
            self = .missing
        case .invalidState(let reason):
            self = .invalid(reason)
        case .kitLegacy:
            self = .needsMigration(.legacy)
        case .nuxt:
            self = .needsMigration(.nuxt)
        case .other:
            self = .needsMigration(.other)
        case .kitV3(let state):
            let conflicts = snapshot.unresolvedConflictCount
            if conflicts > 0 {
                self = .unresolvedConflicts(conflicts)
            } else if !snapshot.usesDefaultTemplate {
                self = .otherTemplate
            } else if snapshot.availability == .notOnMain {
                self = .commitNotOnMain(shortSHA: String(state.commit.prefix(7)))
            } else if let behind = snapshot.behind, snapshot.availability == .onMain {
                self = behind == 0 ? .upToDate : .behind(behind, snapshot.preview.value.map(PreviewSummary.init(report:)))
            } else {
                self = .checking
            }
        }
    }
}
