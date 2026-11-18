/// Why a project shows up under "Needs Attention" (spec 2.6).
public enum AttentionReason: Sendable, Hashable {
    case behind
    case conflicts
    case migration
    case missing
    case missingEnvKeys(Int)
    case siteDown
    case invalid

    public static func reasons(for snapshot: ProjectSnapshot) -> Set<AttentionReason> {
        var reasons: Set<AttentionReason> = []
        switch ProjectStatus(snapshot: snapshot) {
        case .missing: reasons.insert(.missing)
        case .invalid: reasons.insert(.invalid)
        // A folder that is not a Nuxt project at all is not something the kit can migrate.
        case .needsMigration(let source): if source != .other { reasons.insert(.migration) }
        case .unresolvedConflicts: reasons.insert(.conflicts)
        case .behind: reasons.insert(.behind)
        case .kitSource, .pinned, .otherTemplate, .commitNotOnMain, .upToDate, .checkFailed, .checking: break
        }
        if let missing = snapshot.env?.missing.count, missing > 0 {
            reasons.insert(.missingEnvKeys(missing))
        }
        if let health = snapshot.health, !health.isUp {
            reasons.insert(.siteDown)
        }
        return reasons
    }
}
