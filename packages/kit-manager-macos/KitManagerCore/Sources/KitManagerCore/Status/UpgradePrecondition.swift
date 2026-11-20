/// Whether "Upgrade with Claude" may start, and if not, the first reason why (spec 2.8).
public enum UpgradePrecondition: Sendable, Equatable {
    /// Not a kit v3 project, or the kit checkout itself.
    case notKitV3
    case unresolvedConflicts
    /// Pinned to a tag or branch other than `main`; the upgrade only ever targets `origin/main`.
    case pinned(ref: String)
    /// The kit commit is not on `main` in the local checkout, or the template is another repository
    /// (a local `--to` cannot render those).
    case notOnMain
    /// `origin/main` of the kit checkout cannot be read (not fetched yet, wrong checkout, no remote).
    case kitUnavailable
    case upToDate
    /// Not a git repository, no commits, or a detached HEAD: there is no branch to come back to.
    case noBranch
    case ready

    public init(snapshot: ProjectSnapshot, latestMain: String?) {
        guard let state = snapshot.kitState, !snapshot.isKitSource else {
            self = .notKitV3
            return
        }
        if snapshot.unresolvedConflictCount > 0 {
            self = .unresolvedConflicts
        } else if let ref = state.pinnedRef {
            self = .pinned(ref: ref)
        } else if latestMain == nil {
            self = .kitUnavailable
        } else if !snapshot.usesDefaultTemplate || snapshot.availability != .onMain {
            self = .notOnMain
        } else if snapshot.behind == 0 {
            self = .upToDate
        } else if snapshot.git?.branch == nil {
            self = .noBranch
        } else {
            self = .ready
        }
    }

    /// Why the upgrade cannot start; nil when it can.
    public var reason: String? {
        switch self {
        case .notKitV3: "Only projects created from the kit (v3) can be upgraded."
        case .unresolvedConflicts: "Resolve the conflicts left by an earlier upgrade first."
        case .pinned(let ref):
            "Pinned to \(ref). Run nuxt-saas upgrade --template \(KitState.defaultTemplate) in the project to follow main again."
        case .notOnMain:
            "The project's kit commit is not on main in your kit checkout, or its template is not the kit, so it cannot be upgraded here."
        case .kitUnavailable:
            "The latest kit (origin/main) cannot be read from your kit checkout. Check the kit path in Settings and that it has an origin remote with a main branch."
        case .upToDate: "Already up to date with the latest kit."
        case .noBranch: "Check out a branch first. The project is not on a git branch."
        case .ready: nil
        }
    }
}
