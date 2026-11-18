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
    private(set) var catalogue: [KitModuleInfo] = []
    private(set) var latestMain: String?
    private(set) var cliStatus: CLIStatus = .missingCheckout
    private(set) var fetchState: FetchState = .idle
    private(set) var isBuildingCLI = false
    private(set) var buildFailure: String?
    private(set) var refreshingCount = 0
    /// Shown in an alert; the view clears it.
    var errorMessage: String?

    @ObservationIgnored private let context: ModelContext
    @ObservationIgnored private let logger = Logger(subsystem: "studio.nonamestudio.KitManager", category: "AppModel")
    @ObservationIgnored private(set) var environment: ShellEnvironment
    @ObservationIgnored private(set) var cli: NuxtSaasCLI
    @ObservationIgnored private(set) var kit: KitRepository
    @ObservationIgnored private(set) var git: GitInspector
    @ObservationIgnored private(set) var launcher: Launcher
    @ObservationIgnored private let health: any HealthChecking = HealthChecker()
    @ObservationIgnored private let limiter = RenderLimiter(limit: 2)
    @ObservationIgnored private var loader: SnapshotLoader
    @ObservationIgnored private var mapping: ModuleMapping?
    @ObservationIgnored private var catalogueCommit: String?
    @ObservationIgnored private var refreshing: Set<UUID> = []
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
        await refreshAll()
        await fetchKit()
        restartFetchTimer()
    }

    /// Called when the kit path changes in Settings.
    func reconfigure() async {
        rebuildServices()
        latestMain = nil
        catalogue = []
        mapping = nil
        catalogueCommit = nil
        await refreshAll()
        await fetchKit()
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
        isBuildingCLI = false
        await refreshAll()
    }

    // MARK: Kit fetch

    func fetchKit() async {
        guard fetchState != .fetching else { return }
        fetchState = .fetching
        do {
            try await kit.fetch()
            fetchState = .fetched(.now)
        } catch {
            // Offline, no remote, or no checkout: keep working from the last known `origin/main`.
            logger.info("kit fetch failed: \(error.localizedDescription, privacy: .public)")
            fetchState = .offline
        }
        let before = latestMain
        await updateLatestMain()
        if latestMain != before {
            await refreshAll()
        }
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
        latestMain = try? await kit.latestMain()
        if let latestMain { await loadCatalogue(at: latestMain) }
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

    /// Local refresh: no fetch. One project's failure never blocks the others.
    func refreshAll() async {
        refreshCLIStatus()
        latestMain = try? await kit.latestMain()
        if let latestMain { await loadCatalogue(at: latestMain) }
        let refs = fetchProjects().map(ProjectRef.init)
        let known = Set(refs.map(\.id))
        for id in snapshots.keys where !known.contains(id) { snapshots[id] = nil }
        await withTaskGroup(of: Void.self) { group in
            for ref in refs {
                group.addTask { await self.refresh(ref) }
            }
        }
    }

    func refresh(_ project: Project) async {
        await refresh(ProjectRef(project))
    }

    private func refresh(_ ref: ProjectRef) async {
        guard refreshing.insert(ref.id).inserted else { return }
        refreshingCount += 1
        defer {
            refreshing.remove(ref.id)
            refreshingCount -= 1
        }
        let input = SnapshotLoader.Input(
            latestMain: latestMain, mapping: mapping, cliReady: cliStatus == .ready,
            previousHealth: snapshots[ref.id]?.health)
        let loaded = await loader.load(ref, input: input)
        snapshots[ref.id] = loaded.snapshot
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
        guard let job = job(for: ref.id) else { return }
        update(ref.id) { snapshot in
            if snapshot.preview.value == nil { snapshot.preview = .loading }
        }
        applyPreview(await loader.renderPreview(ref, job: job), for: ref.id)
    }

    func loadInspect(_ project: Project) async {
        let ref = ProjectRef(project)
        guard let job = job(for: ref.id) else { return }
        update(ref.id) { snapshot in
            if snapshot.inspect.value == nil { snapshot.inspect = .loading }
        }
        applyInspect(await loader.renderInspect(ref, job: job), for: ref.id)
    }

    /// The local checkout serves a project on the default template whose commit is on main;
    /// everything else renders from its recorded template.
    private func job(for id: UUID) -> SnapshotLoader.Job? {
        guard let snapshot = snapshots[id], let state = snapshot.kitState else { return nil }
        let local = snapshot.availability == .onMain ? latestMain : nil
        return SnapshotLoader.Job(
            recordedCommit: state.commit, source: local == nil ? .recorded : .local, target: local)
    }

    private func applyPreview(_ rendered: SnapshotLoader.Rendered<TransitionReport>, for id: UUID) {
        update(id) { $0.preview = rendered.result }
        guard case .loaded(let report, _) = rendered.result, let key = rendered.key,
            let project = fetchProject(id: id)
        else { return }
        project.previewCache = try? JSONEncoder().encode(CachedResult(key: key, value: report, checkedAt: .now))
    }

    private func applyInspect(_ rendered: SnapshotLoader.Rendered<InspectReport>, for id: UUID) {
        update(id) { $0.inspect = rendered.result }
        guard case .loaded(let report, _) = rendered.result, let key = rendered.key,
            let project = fetchProject(id: id)
        else { return }
        project.inspectCache = try? JSONEncoder().encode(CachedResult(key: key, value: report, checkedAt: .now))
    }

    private func update(_ id: UUID, _ change: (inout ProjectSnapshot) -> Void) {
        guard var snapshot = snapshots[id] else { return }
        change(&snapshot)
        snapshots[id] = snapshot
    }

    // MARK: Projects

    var attentionCount: Int {
        snapshots.values.filter { !AttentionReason.reasons(for: $0).isEmpty }.count
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
        let refs = added.map(ProjectRef.init)
        Task {
            for ref in refs { await refresh(ref) }
        }
        return added.count
    }

    func remove(_ project: Project) {
        snapshots[project.id] = nil
        context.delete(project)
        save()
    }

    func relocate(_ project: Project, to url: URL) {
        project.path = url.standardizedFileURL.path
        project.previewCache = nil
        project.inspectCache = nil
        save()
        Task { await refresh(project) }
    }

    func scan(folder: URL) async -> [ScanCandidate] {
        await Task.detached(priority: .userInitiated) { ScanService.scan(folder) }.value
    }

    var knownPaths: Set<String> {
        Set(fetchProjects().map(\.path))
    }

    private func fetchProjects() -> [Project] {
        (try? context.fetch(FetchDescriptor<Project>(sortBy: [SortDescriptor(\.addedAt)]))) ?? []
    }

    private func fetchProject(id: UUID) -> Project? {
        var descriptor = FetchDescriptor<Project>(predicate: #Predicate { $0.id == id })
        descriptor.fetchLimit = 1
        return try? context.fetch(descriptor).first
    }

    private func save() {
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

    private func perform(_ operation: () async throws -> Void) async {
        do {
            try await operation()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
