/// Everything the app knows about one project right now. Derived at runtime, never persisted
/// (except the preview and inspect results, which are cached separately).
public struct ProjectSnapshot: Sendable, Equatable {
    public var kind: ProjectKind
    /// The folder is the configured kit checkout itself, not a project that uses the kit.
    public var isKitSource: Bool
    public var package: PackageInfo?
    public var git: GitStatus?
    public var env: EnvCheck?
    public var wrangler: WranglerInfo?
    public var health: SiteHealth?
    public var availability: CommitAvailability?
    public var versionLabel: String?
    public var behind: Int?
    /// Why availability, version or behind count could not be read, when git failed on a commit that is on main.
    public var kitCheckFailure: String?
    /// Why `origin/main` could not be read once the first fetch attempt has finished (wrong kit path,
    /// no remote, no `main` branch, offline with nothing fetched); nil while that is still unknown or when it is known.
    public var kitUnavailableReason: String?
    public var preview: Loadable<TransitionReport>
    public var inspect: Loadable<InspectReport>
    public var changelog: [KitCommit]
    /// Why the changelog could not be read, when `git log` failed.
    public var changelogFailure: String?

    public init(
        kind: ProjectKind, isKitSource: Bool = false, package: PackageInfo? = nil, git: GitStatus? = nil, env: EnvCheck? = nil,
        wrangler: WranglerInfo? = nil, health: SiteHealth? = nil, availability: CommitAvailability? = nil,
        versionLabel: String? = nil, behind: Int? = nil, kitCheckFailure: String? = nil,
        kitUnavailableReason: String? = nil, preview: Loadable<TransitionReport> = .idle,
        inspect: Loadable<InspectReport> = .idle, changelog: [KitCommit] = [],
        changelogFailure: String? = nil
    ) {
        self.kind = kind
        self.isKitSource = isKitSource
        self.package = package
        self.git = git
        self.env = env
        self.wrangler = wrangler
        self.health = health
        self.availability = availability
        self.versionLabel = versionLabel
        self.behind = behind
        self.kitCheckFailure = kitCheckFailure
        self.kitUnavailableReason = kitUnavailableReason
        self.preview = preview
        self.inspect = inspect
        self.changelog = changelog
        self.changelogFailure = changelogFailure
    }

    /// True only for a v3 project whose recorded template is the kit itself, on `main`.
    public var usesDefaultTemplate: Bool {
        guard case .kitV3(let state) = kind else { return false }
        return state.usesDefaultTemplate
    }

    /// The recorded kit state when this is a v3 project.
    public var kitState: KitState? {
        guard case .kitV3(let state) = kind else { return nil }
        return state
    }

    /// Conflicts still unresolved: the CLI's own answer when `inspect` has loaded, otherwise what
    /// `.nuxt-saas.json` recorded.
    public var unresolvedConflictCount: Int {
        if let report = inspect.value { return report.conflicts.unresolved.count }
        return kitState?.conflicts.count ?? 0
    }
}
