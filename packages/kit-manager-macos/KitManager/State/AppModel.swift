import AppKit
import Foundation
import KitManagerCore
import Observation
import OSLog
import SwiftData

@MainActor
@Observable
final class AppModel {
    private(set) var snapshots: [UUID: ProjectSnapshot] = [:]
    private(set) var snapshotRevisions: [UUID: Int] = [:]
    private(set) var catalogue: [KitModuleInfo] = []
    private(set) var latestMain: String?
    /// `v3.1.0 +2` for `latestMain`; nil while unknown or when git cannot describe it.
    private(set) var latestLabel: String?
    private(set) var cliStatus: CLIStatus = .missingCheckout
    private(set) var fetchState: FetchState = .idle
    /// True once the first kit fetch attempt has finished, whether or not it succeeded.
    private(set) var hasCheckedKit = false
    /// Why `origin/main` could not be read at the last attempt; nil when it could.
    private(set) var latestMainFailure: String?
    private(set) var isBuildingCLI = false
    private(set) var buildFailure: String?
    private(set) var refreshingCount = 0
    /// Shown in an alert; the view clears it.
    var errorMessage: String?
    /// The upgrade or migration sheet to present, if any.
    var flow: FlowRequest?
    /// A module the project list is narrowed to; nil shows every project in the sidebar filter.
    var moduleFilter: String?
    /// Whether the ⌘K switcher sheet is showing.
    var isSwitcherPresented = false
    var sidebar: SidebarItem = .allProjects {
        didSet {
            guard sidebar != oldValue else { return }
            // Keep only rows that belong to the new filter, not those held visible by selection.
            selection = selection.filter { matchesProjectFilters(snapshots[$0]) }
        }
    }
    var selection: Set<UUID> = []
    var selectedProjectID: UUID? {
        get { selection.count == 1 ? selection.first : nil }
        set { selection = newValue.map { [$0] } ?? [] }
    }

    @ObservationIgnored private let context: ModelContext
    @ObservationIgnored private let logger = Logger(subsystem: "studio.nonamestudio.KitManager", category: "AppModel")
    @ObservationIgnored private(set) var environment: ShellEnvironment
    @ObservationIgnored private(set) var cli: NuxtSaasCLI
    @ObservationIgnored private(set) var kit: KitRepository
    @ObservationIgnored private(set) var git: GitInspector
    @ObservationIgnored private(set) var launcher: Launcher
    @ObservationIgnored let health: any HealthChecking = HealthChecker()
    @ObservationIgnored let limiter = RenderLimiter(limit: 2)
    @ObservationIgnored private var loader: SnapshotLoader
    @ObservationIgnored private(set) var mapping: ModuleMapping?
    private var catalogueCommit: String?
    @ObservationIgnored private var refreshing: Set<UUID> = []
    /// Projects whose refresh was requested while one was already running; they run once more.
    @ObservationIgnored private var rerunRequested: Set<UUID> = []
    /// Renders that failed for their current key, so the CLI is not re-run on every window activation.
    @ObservationIgnored private var failures: [UUID: RenderFailures] = [:]
    /// Upgrade branches the app created and has not finished with; only these can be rolled back.
    var upgradeBranches: [UUID: UpgradeBranchRecord] = [:]
    @ObservationIgnored private var fetchTimer: Task<Void, Never>?
    @ObservationIgnored private var didBootstrap = false

    init(context: ModelContext, startupWarning: String? = nil) {
        self.context = context
        errorMessage = startupWarning
        let environment = ShellEnvironment(path: ShellEnvironment.fallbackPath)
        let services = Self.makeServices(environment: environment, health: health, limiter: limiter)
        self.environment = environment
        cli = services.cli
        kit = services.kit
        git = services.git
        launcher = services.launcher
        loader = services.loader
    }

    // MARK: Services

    private struct RenderFailures {
        var preview: CachedFailure?
        var inspect: CachedFailure?
    }

    private struct Services {
        let cli: NuxtSaasCLI
        let kit: KitRepository
        let git: GitInspector
        let launcher: Launcher
        let loader: SnapshotLoader
    }

    private static func makeServices(
        environment: ShellEnvironment, health: any HealthChecking, limiter: RenderLimiter
    ) -> Services {
        let runner = ProcessRunner(environment: environment)
        let root = URL(filePath: AppSettings.kitPath)
        let cli = NuxtSaasCLI(kitRoot: root, runner: runner)
        let kit = KitRepository(root: root, runner: runner)
        let git = GitInspector(runner: runner)
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let launcher = Launcher(
            scriptsDirectory: caches.appending(path: "studio.nonamestudio.KitManager/launch"),
            environment: environment, runner: runner)
        let loader = SnapshotLoader(git: git, kit: kit, cli: cli, health: health, limiter: limiter)
        return Services(cli: cli, kit: kit, git: git, launcher: launcher, loader: loader)
    }

    private func rebuildServices() {
        let services = Self.makeServices(environment: environment, health: health, limiter: limiter)
        cli = services.cli
        kit = services.kit
        git = services.git
        launcher = services.launcher
        loader = services.loader
    }

    // MARK: Lifecycle

    func bootstrap() async {
        guard !didBootstrap else { return }
        didBootstrap = true
        environment = await ShellEnvironment.resolve(shell: ProcessInfo.processInfo.environment["SHELL"])
        rebuildServices()
        launcher.removeStaleFiles()
        MigrationWorkspace.removeStale()
        // Fetch first, so the first pass renders against the fresh `origin/main` instead of twice.
        await fetchAndReadMain()
        await refreshAll()
        restartFetchTimer()
    }

    /// Called when the kit path changes in Settings.
    func reconfigure() async {
        rebuildServices()
        latestMain = nil
        latestLabel = nil
        catalogue = []
        mapping = nil
        catalogueCommit = nil
        latestMainFailure = nil
        hasCheckedKit = false
        await fetchAndReadMain()
        await refreshAll()
    }

    func refreshCLIStatus() {
        cliStatus = cli.status()
    }

    func buildCLI() async {
        guard !isBuildingCLI else { return }
        isBuildingCLI = true
        buildFailure = nil
        do {
            try await cli.build()
        } catch {
            buildFailure = error.localizedDescription
        }
        // Read the new status first, so the banner never flashes "Build CLI" again before it goes away.
        refreshCLIStatus()
        isBuildingCLI = false
        await refreshAll()
    }

    // MARK: Kit fetch

    func fetchKit() async {
        if await fetchAndReadMain() { await refreshAll() }
    }

    /// Fetches the kit checkout and reads `origin/main`. Returns whether anything the projects depend on
    /// changed: the commit, or the reason it cannot be read.
    @discardableResult
    private func fetchAndReadMain() async -> Bool {
        guard fetchState != .fetching else { return false }
        fetchState = .fetching
        do {
            try await kit.fetch()
            fetchState = .fetched(.now)
        } catch {
            // Offline, no remote, or no checkout: keep working from the last known `origin/main`.
            logger.info("kit fetch failed: \(error.localizedDescription, privacy: .public)")
            fetchState = .offline
        }
        let before = (latestMain, kitUnavailableReason)
        await updateLatestMain()
        hasCheckedKit = true
        return before != (latestMain, kitUnavailableReason)
    }

    func restartFetchTimer() {
        fetchTimer?.cancel()
        fetchTimer = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(AppSettings.fetchIntervalMinutes * 60))
                guard !Task.isCancelled else { return }
                await fetchKit()
            }
        }
    }

    private func updateLatestMain() async {
        do {
            latestMain = try await kit.latestMain()
            latestMainFailure = nil
        } catch {
            latestMain = nil
            latestMainFailure = error.localizedDescription
        }
        await updateLatestLabel()
        if let latestMain { await loadCatalogue(at: latestMain) }
    }

    private func updateLatestLabel() async {
        guard let latestMain else {
            latestLabel = nil
            return
        }
        latestLabel = await kit.versionLabel(for: latestMain)
    }

    /// A changelog needs the module mapping for the current main, not a previous fetch.
    var canLoadKitChangelog: Bool {
        latestMain != nil && catalogueCommit == latestMain
    }

    private func loadCatalogue(at commit: String) async {
        guard catalogueCommit != commit else { return }
        refreshCLIStatus()
        guard cliStatus == .ready else { return }
        do {
            let cli = cli
            let report = try await limiter.run { try await cli.modules(at: commit) }
            let config = try await kit.kitConfig(at: commit)
            catalogue = report.modules
            mapping = ModuleMapping(exclude: config.exclude, modules: report.modules)
            catalogueCommit = commit
        } catch {
            logger.error("module catalogue failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: Refresh

    var isRefreshing: Bool { refreshingCount > 0 }

    /// Why no project can be compared with the kit, once the first fetch attempt has finished and
    /// `origin/main` is still unreadable (wrong kit path, fork, `master` default, not a repository, offline
    /// with nothing fetched). Until then the status reads "checking".
    var kitUnavailableReason: String? {
        guard hasCheckedKit, latestMain == nil else { return nil }
        let detail = latestMainFailure ?? "origin/main could not be read."
        guard fetchState == .offline else { return detail }
        return "The kit could not be fetched and no origin/main is known yet. \(detail)"
    }

    /// Local refresh: no fetch. One project's failure never blocks the others. `force` also retries
    /// renders that failed earlier; window activation does not.
    func refreshAll(force: Bool = false) async {
        // Ignore repeated manual refreshes without dropping automatic refreshes triggered by kit changes.
        guard !force || !isRefreshing else { return }
        refreshingCount += 1
        defer { refreshingCount -= 1 }

        refreshCLIStatus()
        await updateLatestMain()
        let ids = Set(fetchProjects().map(\.id))
        for id in snapshots.keys where !ids.contains(id) { snapshots[id] = nil }
        if force { failures = [:] }
        await refreshProjects(ids)
    }

    func refreshProjects(_ ids: Set<UUID>, force: Bool = false) async {
        if force {
            for id in ids { failures[id] = nil }
        }
        await withTaskGroup(of: Void.self) { group in
            for id in ids {
                group.addTask { await self.refresh(id: id) }
            }
        }
    }

    func refresh(_ project: Project, force: Bool = false) async {
        if force { failures[project.id] = nil }
        await refresh(id: project.id)
    }

    /// Requests that arrive while a pass is running are coalesced into one more pass, so a refresh
    /// asked for after an edit is never lost.
    private func refresh(id: UUID) async {
        guard refreshing.insert(id).inserted else {
            rerunRequested.insert(id)
            return
        }
        refreshingCount += 1
        defer {
            refreshing.remove(id)
            refreshingCount -= 1
        }
        repeat {
            rerunRequested.remove(id)
            guard let project = fetchProject(id: id) else {
                snapshots[id] = nil
                failures[id] = nil
                return
            }
            await refreshPass(ProjectRef(project))
        } while rerunRequested.contains(id)
    }

    private func refreshPass(_ ref: ProjectRef) async {
        let input = SnapshotLoader.Input(
            latestMain: latestMain, kitUnavailableReason: kitUnavailableReason, mapping: mapping,
            cliReady: cliStatus == .ready,
            kitRoot: AppSettings.kitPath.isEmpty ? nil : URL(filePath: AppSettings.kitPath),
            previousHealth: snapshots[ref.id]?.health, previewFailure: failures[ref.id]?.preview,
            inspectFailure: failures[ref.id]?.inspect)
        let loaded = await loader.load(ref, input: input)
        // The project may have been removed while the folder was being read.
        guard fetchProject(id: ref.id) != nil else { return }
        snapshots[ref.id] = loaded.snapshot
        snapshotRevisions[ref.id, default: 0] += 1
        await run(loaded.work, for: ref)
    }

    private func run(_ work: SnapshotLoader.Work, for ref: ProjectRef) async {
        let loader = loader
        await withTaskGroup(of: Void.self) { group in
            if let url = work.healthURL {
                group.addTask {
                    let result = await loader.checkHealth(url)
                    await self.update(ref.id) { $0.health = result }
                }
            }
            if let job = work.preview {
                group.addTask { await self.applyPreview(await loader.renderPreview(ref, job: job), for: ref.id) }
            }
            if let job = work.inspect {
                group.addTask { await self.applyInspect(await loader.renderInspect(ref, job: job), for: ref.id) }
            }
        }
    }

    /// Explicit "Preview again" from the detail page: recomputes whatever the cache says.
    func loadPreview(_ project: Project) async {
        let ref = ProjectRef(project)
        guard let snapshot = snapshots[ref.id],
            let job = RenderPlanner.previewJob(for: snapshot, latestMain: latestMain)
        else { return }
        failures[ref.id]?.preview = nil
        update(ref.id) { snapshot in
            if snapshot.preview.value == nil { snapshot.preview = .loading }
        }
        applyPreview(await loader.renderPreview(ref, job: job), for: ref.id)
    }

    func loadInspect(_ project: Project) async {
        let ref = ProjectRef(project)
        guard let snapshot = snapshots[ref.id],
            let job = RenderPlanner.inspectJob(for: snapshot, latestMain: latestMain)
        else { return }
        failures[ref.id]?.inspect = nil
        update(ref.id) { snapshot in
            if snapshot.inspect.value == nil { snapshot.inspect = .loading }
        }
        applyInspect(await loader.renderInspect(ref, job: job), for: ref.id)
    }

    private func applyPreview(_ rendered: SnapshotLoader.Rendered<TransitionReport>, for id: UUID) {
        update(id) { $0.preview = rendered.result }
        switch rendered.result {
        case .loaded(let report, _):
            failures[id]?.preview = nil
            guard let key = rendered.key, let project = fetchProject(id: id) else { return }
            project.previewCache = try? JSONEncoder().encode(CachedResult(key: key, value: report, checkedAt: .now))
        case .failed(let message):
            guard let key = rendered.key else { return }
            failures[id, default: RenderFailures()].preview = CachedFailure(key: key, message: message)
        case .idle, .loading:
            break
        }
    }

    private func applyInspect(_ rendered: SnapshotLoader.Rendered<InspectReport>, for id: UUID) {
        update(id) { $0.inspect = rendered.result }
        switch rendered.result {
        case .loaded(let report, _):
            failures[id]?.inspect = nil
            guard let key = rendered.key, let project = fetchProject(id: id) else { return }
            project.inspectCache = try? JSONEncoder().encode(CachedResult(key: key, value: report, checkedAt: .now))
        case .failed(let message):
            guard let key = rendered.key else { return }
            failures[id, default: RenderFailures()].inspect = CachedFailure(key: key, message: message)
        case .idle, .loading:
            break
        }
    }

    func update(_ id: UUID, _ change: (inout ProjectSnapshot) -> Void) {
        guard var snapshot = snapshots[id] else { return }
        change(&snapshot)
        snapshots[id] = snapshot
    }

    // MARK: Projects

    var attentionCount: Int {
        snapshots.values.filter { !AttentionReason.reasons(for: $0).isEmpty }.count
    }

    func matches(_ snapshot: ProjectSnapshot?, in item: SidebarItem) -> Bool {
        switch item {
        case .allProjects: true
        case .needsAttention: snapshot.map { !AttentionReason.reasons(for: $0).isEmpty } ?? false
        case .status(let filter): snapshot.map { filter.matches(ProjectStatus(snapshot: $0)) } ?? false
        case .modules, .whatsNew: false
        }
    }

    func matchesProjectFilters(_ snapshot: ProjectSnapshot?) -> Bool {
        matches(snapshot, in: sidebar) && matchesModuleFilter(snapshot)
    }

    private func matchesModuleFilter(_ snapshot: ProjectSnapshot?) -> Bool {
        guard let moduleFilter else { return true }
        return snapshot?.kitState?.modules.contains(moduleFilter) == true
    }

    func counts(for items: [SidebarItem], in projects: [Project]) -> [SidebarItem: Int] {
        let items = Set(items)
        var counts = Dictionary(uniqueKeysWithValues: items.map { ($0, 0) })
        for project in projects {
            let snapshot = snapshots[project.id]
            for item in items where matches(snapshot, in: item) {
                counts[item, default: 0] += 1
            }
        }
        return counts
    }

    /// Adds every folder in `urls` that is not already listed; returns how many were new.
    @discardableResult
    func add(urls: [URL]) -> Int {
        var known = Set(fetchProjects().map(\.path))
        var added: [Project] = []
        for url in urls {
            let folder = url.standardizedFileURL
            var isDirectory: ObjCBool = false
            guard FileManager.default.fileExists(atPath: folder.path, isDirectory: &isDirectory),
                isDirectory.boolValue, known.insert(folder.path).inserted
            else { continue }
            let project = Project(path: folder.path)
            context.insert(project)
            added.append(project)
        }
        save()
        let ids = added.map(\.id)
        Task {
            await withTaskGroup(of: Void.self) { group in
                for id in ids { group.addTask { await self.refresh(id: id) } }
            }
        }
        return added.count
    }

    func remove(_ project: Project) {
        selection.remove(project.id)
        snapshots[project.id] = nil
        snapshotRevisions[project.id] = nil
        failures[project.id] = nil
        rerunRequested.remove(project.id)
        context.delete(project)
        save()
    }

    func relocate(_ project: Project, to url: URL) {
        let path = url.standardizedFileURL.path
        if fetchProjects().contains(where: { $0.path == path && $0.id != project.id }) {
            errorMessage = "That folder is already in the project list."
            return
        }
        project.path = path
        project.previewCache = nil
        project.inspectCache = nil
        failures[project.id] = nil
        save()
        Task { await refresh(project) }
    }

    func scan(folder: URL) async -> [ScanCandidate] {
        await Task.detached(priority: .userInitiated) { ScanService.scan(folder) }.value
    }

    /// Selects a project from anywhere, falling back to All Projects if the filter hides it.
    func openDetail(_ project: Project) {
        let snapshot = snapshots[project.id]
        if !matches(snapshot, in: sidebar) { sidebar = .allProjects }
        if !matchesModuleFilter(snapshot) { moduleFilter = nil }
        selectedProjectID = project.id
    }

    var knownPaths: Set<String> {
        Set(fetchProjects().map(\.path))
    }

    func fetchProjects() -> [Project] {
        (try? context.fetch(FetchDescriptor<Project>(sortBy: [SortDescriptor(\.addedAt)]))) ?? []
    }

    private func fetchProject(id: UUID) -> Project? {
        var descriptor = FetchDescriptor<Project>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return try? context.fetch(descriptor).first
    }

    func save() {
        do {
            try context.save()
        } catch {
            errorMessage = "Could not save the project list: \(error.localizedDescription)"
        }
    }

    // MARK: Actions

    func openInVSCode(_ project: Project) async {
        await perform { try await launcher.openInVSCode(project.url) }
    }

    func openTerminal(_ project: Project, command: LaunchCommand) async {
        await perform { try await launcher.openTerminal(at: project.url, command: command) }
    }

    func reveal(_ project: Project) async {
        await perform { try await launcher.revealInFinder(project.url) }
    }

    func copyPath(_ project: Project) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(project.path, forType: .string)
    }

    func perform(_ operation: () async throws -> Void) async {
        do {
            try await operation()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
