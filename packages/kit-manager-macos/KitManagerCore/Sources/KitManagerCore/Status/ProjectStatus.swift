public enum ProjectStatus: Sendable, Equatable {
    case missing
    case invalid(String)
    /// The kit checkout itself: it is the source of the kit, so there is nothing to migrate or upgrade.
    case kitSource
    case needsMigration(MigrationSource)
    case unresolvedConflicts(Int)
    /// Same repository as the kit, but pinned to a tag or branch other than `main`.
    case pinned(ref: String)
    case otherTemplate
    case commitNotOnMain(shortSHA: String)
    case upToDate
    case behind(Int, UpgradePreview)
    /// git could not answer for a commit that is on main; carries the error.
    case checkFailed(String)
    case checking

    /// Picks the first case that applies, in the order declared above.
    public init(snapshot: ProjectSnapshot) {
        switch snapshot.kind {
        case .missing:
            self = .missing
        case .invalidState(let reason):
            self = .invalid(reason)
        case .kitLegacy:
            self = snapshot.isKitSource ? .kitSource : .needsMigration(.legacy)
        case .nuxt:
            self = snapshot.isKitSource ? .kitSource : .needsMigration(.nuxt)
        case .other:
            self = snapshot.isKitSource ? .kitSource : .needsMigration(.other)
        case .kitV3(let state):
            let conflicts = snapshot.unresolvedConflictCount
            if conflicts > 0 {
                self = .unresolvedConflicts(conflicts)
            } else if !snapshot.usesDefaultTemplate {
                self = state.pinnedRef.map { .pinned(ref: $0) } ?? .otherTemplate
            } else if snapshot.availability == .notOnMain {
                self = .commitNotOnMain(shortSHA: String(state.commit.prefix(7)))
            } else if let behind = snapshot.behind, snapshot.availability == .onMain {
                self = behind == 0 ? .upToDate : .behind(behind, UpgradePreview(snapshot.preview))
            } else if let failure = snapshot.kitCheckFailure {
                self = .checkFailed(failure)
            } else {
                self = .checking
            }
        }
    }
}
