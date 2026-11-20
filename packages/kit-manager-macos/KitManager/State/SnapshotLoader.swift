import Foundation
import KitManagerCore

/// Builds a `ProjectSnapshot` off the main actor. Nothing here throws: every failure ends up as a
/// value in the snapshot, so one broken project never blocks the others.
struct SnapshotLoader: Sendable {
    struct Input: Sendable {
        let latestMain: String?
        /// Why `latestMain` is nil once the first fetch attempt has finished; nil while that is unknown.
        let kitUnavailableReason: String?
        let mapping: ModuleMapping?
        let cliReady: Bool
        /// The configured kit checkout, nil when none is set.
        let kitRoot: URL?
        let previousHealth: SiteHealth?
        let previewFailure: CachedFailure?
        let inspectFailure: CachedFailure?
    }

    struct Work: Sendable {
        var healthURL: URL?
        var preview: RenderJob?
        var inspect: RenderJob?
    }

    struct Loaded: Sendable {
        var snapshot: ProjectSnapshot
        var work: Work
    }

    struct Rendered<Value: Sendable & Equatable>: Sendable {
        let result: Loadable<Value>
        /// What the result was computed for, success or failure; nil when the folder has no git fingerprint.
        let key: CacheKey?
    }

    let git: GitInspector
    let kit: KitRepository
    let cli: NuxtSaasCLI
    let health: any HealthChecking
    let limiter: RenderLimiter

    // MARK: Cheap, local facts

    func load(_ ref: ProjectRef, input: Input) async -> Loaded {
        let kind = ProjectClassifier.classify(ref.url)
        var snapshot = ProjectSnapshot(kind: kind, isKitSource: KitCheckout.isSource(ref.url, kitRoot: input.kitRoot))
        if case .missing = kind {
            return Loaded(snapshot: snapshot, work: Work())
        }

        let url = ref.url
        async let package = PackageReader.read(url)
        async let gitStatus = try? await git.status(url)
        async let remote = git.remoteURL(url)
        async let fingerprint = try? await git.fingerprint(url)
        async let env = EnvKeys.check(url)
        async let wrangler = WranglerInfo.read(url)

        snapshot.package = await package
        snapshot.git = await gitStatus
        snapshot.repositoryURL = await remote.flatMap { RemoteWebURL.repository(fromRemote: $0) }
        snapshot.env = await env
        snapshot.wrangler = await wrangler
        // Like the CLI, ignore a report for a commit the project is no longer on (rolled back or restored).
        if case .kitV3(let state) = kind {
            snapshot.lastReport = SavedReport.read(url).flatMap { $0.transition.to == state.commit ? $0 : nil }
        }

        var work = Work()
        work.healthURL = ProductionURL.resolve(wrangler: snapshot.wrangler, override: ref.productionURL)
        // A previous result for a URL that no longer resolves would be misleading.
        snapshot.health = work.healthURL == nil ? nil : input.previousHealth

        if case .kitV3(let state) = kind {
            snapshot.kitUnavailableReason = input.latestMain == nil ? input.kitUnavailableReason : nil
            await readKitHistory(of: state, input: input, into: &snapshot)
            let plan = RenderPlanner.plan(
                RenderPlanner.Input(
                    state: state, fingerprint: await fingerprint, availability: snapshot.availability,
                    behind: snapshot.behind, latestMain: input.latestMain, cliReady: input.cliReady,
                    cachedPreview: Self.decode(CachedResult<TransitionReport>.self, from: ref.previewCache),
                    cachedInspect: Self.decode(CachedResult<InspectReport>.self, from: ref.inspectCache),
                    previewFailure: input.previewFailure, inspectFailure: input.inspectFailure))
            snapshot.preview = plan.preview
            snapshot.inspect = plan.inspect
            work.preview = plan.previewJob
            work.inspect = plan.inspectJob
        }
        return Loaded(snapshot: snapshot, work: work)
    }

    /// Availability, version label, commits behind and changelog. They only make sense for the default
    /// template (or a pin on the kit's repository), and only once `origin/main` is known (spec 2.2). A git failure is kept on the snapshot
    /// instead of leaving the status on "checking".
    private func readKitHistory(of state: KitState, input: Input, into snapshot: inout ProjectSnapshot) async {
        // A project pinned to a tag of the kit's own repository still gets a version label from the clone.
        guard state.isDefaultRepository, input.latestMain != nil else { return }
        let availability = await kit.availability(of: state.commit)
        snapshot.availability = availability
        guard availability == .onMain else { return }

        async let label = kit.versionLabel(for: state.commit)
        snapshot.versionLabel = await label
        // Behind and the changelog follow `main`; a pinned project upgrades along its pin instead.
        guard state.usesDefaultTemplate else { return }
        async let behind = Self.count(kit, state.commit)
        switch await behind {
        case .success(let count): snapshot.behind = count
        case .failure(let error): snapshot.kitCheckFailure = error.localizedDescription
        }
        if let behind = snapshot.behind, behind > 0, let mapping = input.mapping {
            do {
                snapshot.changelog = try await kit.commits(from: state.commit, mapping: mapping)
            } catch {
                snapshot.changelogFailure = error.localizedDescription
            }
        }
    }

    private static func count(_ kit: KitRepository, _ commit: String) async -> Result<Int, any Error> {
        do { return .success(try await kit.commitsBehind(commit)) } catch { return .failure(error) }
    }

    // MARK: Renders and checks

    func renderPreview(_ ref: ProjectRef, job: RenderJob) async -> Rendered<TransitionReport> {
        let fingerprint = try? await git.fingerprint(ref.url)
        let cli = cli
        do {
            let report = try await limiter.run {
                try await cli.upgrade(project: ref.url, to: job.target, source: job.source, check: true, force: false, backup: true)
            }
            return Rendered(
                result: .loaded(report, stale: false),
                key: fingerprint.map { job.storageKey(for: .preview, fingerprint: $0, resolvedTarget: report.to) })
        } catch {
            return Rendered(
                result: .failed(error.localizedDescription), key: fingerprint.map { job.storageKey(for: .preview, fingerprint: $0) })
        }
    }

    func renderInspect(_ ref: ProjectRef, job: RenderJob) async -> Rendered<InspectReport> {
        let fingerprint = try? await git.fingerprint(ref.url)
        let cli = cli
        do {
            let report = try await limiter.run {
                try await cli.inspect(project: ref.url, source: job.source)
            }
            return Rendered(
                result: .loaded(report, stale: false), key: fingerprint.map { job.storageKey(for: .inspect, fingerprint: $0) })
        } catch {
            return Rendered(
                result: .failed(error.localizedDescription), key: fingerprint.map { job.storageKey(for: .inspect, fingerprint: $0) })
        }
    }

    func checkHealth(_ url: URL) async -> SiteHealth {
        await health.check(url)
    }

    // MARK: Helpers

    private static func decode<Value: Codable & Sendable & Equatable>(
        _ type: CachedResult<Value>.Type, from data: Data?
    ) -> CachedResult<Value>? {
        guard let data else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
}
