import Foundation
import KitManagerCore

/// Builds a `ProjectSnapshot` off the main actor. Nothing here throws: every failure ends up as a
/// value in the snapshot, so one broken project never blocks the others.
struct SnapshotLoader: Sendable {
    struct Input: Sendable {
        let latestMain: String?
        let mapping: ModuleMapping?
        let cliReady: Bool
        let previousHealth: SiteHealth?
    }

    /// A CLI render still to run. `target` is the commit to upgrade to; nil uses the recorded template.
    struct Job: Sendable {
        let recordedCommit: String
        let source: KitSourceMode
        let target: String?
    }

    struct Work: Sendable {
        var healthURL: URL?
        var preview: Job?
        var inspect: Job?
    }

    struct Loaded: Sendable {
        var snapshot: ProjectSnapshot
        var work: Work
    }

    struct Rendered<Value: Sendable & Equatable>: Sendable {
        let result: Loadable<Value>
        /// What the result was computed for; nil when the folder has no usable git fingerprint.
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
        var snapshot = ProjectSnapshot(kind: kind)
        snapshot.health = input.previousHealth
        if case .missing = kind {
            return Loaded(snapshot: snapshot, work: Work())
        }

        let url = ref.url
        async let package = PackageReader.read(url)
        async let gitStatus = try? await git.status(url)
        async let fingerprint = try? await git.fingerprint(url)
        async let env = EnvKeys.check(url)
        async let wrangler = WranglerInfo.read(url)

        snapshot.package = await package
        snapshot.git = await gitStatus
        snapshot.env = await env
        snapshot.wrangler = await wrangler

        var work = Work()
        work.healthURL = Self.productionURL(wrangler: snapshot.wrangler, override: ref.productionURL)

        if case .kitV3(let state) = kind {
            await readKitHistory(of: state, input: input, into: &snapshot)
            planRenders(
                for: state, ref: ref, fingerprint: await fingerprint, input: input, snapshot: &snapshot,
                work: &work)
        }
        return Loaded(snapshot: snapshot, work: work)
    }

    /// Availability, version label, commits behind and changelog. They only make sense for the default
    /// template, and only once `origin/main` is known (spec 2.2).
    private func readKitHistory(of state: KitState, input: Input, into snapshot: inout ProjectSnapshot) async {
        guard state.usesDefaultTemplate, input.latestMain != nil else { return }
        let availability = await kit.availability(of: state.commit)
        snapshot.availability = availability
        guard availability == .onMain else { return }

        async let label = kit.versionLabel(for: state.commit)
        async let behind = try? await kit.commitsBehind(state.commit)
        snapshot.versionLabel = await label
        snapshot.behind = await behind
        if let behind = snapshot.behind, behind > 0, let mapping = input.mapping {
            snapshot.changelog = (try? await kit.commits(from: state.commit, mapping: mapping)) ?? []
        }
    }

    /// Restores cached results, and decides which renders must run again. Only a project the local
    /// checkout can serve is previewed automatically; other projects need an explicit click because
    /// the CLI would fetch their recorded template over the network.
    private func planRenders(
        for state: KitState, ref: ProjectRef, fingerprint: String?, input: Input,
        snapshot: inout ProjectSnapshot, work: inout Work
    ) {
        let localTarget: String? = snapshot.availability == .onMain ? input.latestMain : nil
        let source: KitSourceMode = localTarget == nil ? .recorded : .local
        // Without a fingerprint nothing can be validated, so only a click renders.
        let canRender = input.cliReady && fingerprint != nil
            && (snapshot.availability != nil || !state.usesDefaultTemplate)

        let inspectKey = fingerprint.map {
            CacheKey(fingerprint: $0, recordedCommit: state.commit, targetCommit: localTarget ?? "")
        }
        let cachedInspect = Self.decode(CachedResult<InspectReport>.self, from: ref.inspectCache)
        snapshot.inspect = Self.restore(cachedInspect, key: inspectKey)
        if canRender, cachedInspect?.key != inspectKey {
            work.inspect = Job(recordedCommit: state.commit, source: source, target: localTarget)
            if snapshot.inspect == .idle { snapshot.inspect = .loading }
        }

        guard let behind = snapshot.behind, behind > 0, let localTarget else {
            // Up to date, or not served by the local checkout: nothing to preview automatically.
            if snapshot.behind == nil {
                let cached = Self.decode(CachedResult<TransitionReport>.self, from: ref.previewCache)
                snapshot.preview = Self.restore(cached, key: nil)
            }
            return
        }
        let previewKey = fingerprint.map {
            CacheKey(fingerprint: $0, recordedCommit: state.commit, targetCommit: localTarget)
        }
        let cachedPreview = Self.decode(CachedResult<TransitionReport>.self, from: ref.previewCache)
        snapshot.preview = Self.restore(cachedPreview, key: previewKey)
        if canRender, cachedPreview?.key != previewKey {
            work.preview = Job(recordedCommit: state.commit, source: .local, target: localTarget)
            if snapshot.preview == .idle { snapshot.preview = .loading }
        }
    }

    // MARK: Renders and checks

    func renderPreview(_ ref: ProjectRef, job: Job) async -> Rendered<TransitionReport> {
        let fingerprint = try? await git.fingerprint(ref.url)
        let cli = cli
        do {
            let report = try await limiter.run {
                try await cli.upgrade(project: ref.url, to: job.target, source: job.source, check: true)
            }
            let key = fingerprint.map {
                CacheKey(fingerprint: $0, recordedCommit: job.recordedCommit, targetCommit: job.target ?? report.to)
            }
            return Rendered(result: .loaded(report, stale: false), key: key)
        } catch {
            return Rendered(result: .failed(error.localizedDescription), key: nil)
        }
    }

    func renderInspect(_ ref: ProjectRef, job: Job) async -> Rendered<InspectReport> {
        let fingerprint = try? await git.fingerprint(ref.url)
        let cli = cli
        do {
            let report = try await limiter.run {
                try await cli.inspect(project: ref.url, source: job.source)
            }
            let key = fingerprint.map {
                CacheKey(fingerprint: $0, recordedCommit: job.recordedCommit, targetCommit: job.target ?? "")
            }
            return Rendered(result: .loaded(report, stale: false), key: key)
        } catch {
            return Rendered(result: .failed(error.localizedDescription), key: nil)
        }
    }

    func checkHealth(_ url: URL) async -> SiteHealth {
        await health.check(url)
    }

    // MARK: Helpers

    /// The wrangler routes win; the per-project override is the fallback (spec 2.7).
    static func productionURL(wrangler: WranglerInfo?, override: String?) -> URL? {
        if let url = wrangler?.productionURL { return url }
        guard var text = override?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
            return nil
        }
        if !text.contains("://") { text = "https://\(text)" }
        guard let url = URL(string: text), let scheme = url.scheme, ["http", "https"].contains(scheme),
            url.host() != nil
        else { return nil }
        return url
    }

    static func decode<Value: Codable & Sendable & Equatable>(
        _ type: CachedResult<Value>.Type, from data: Data?
    ) -> CachedResult<Value>? {
        guard let data else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    /// A cached value is fresh only when its key matches; otherwise it is shown as stale until recomputed.
    private static func restore<Value: Codable & Sendable & Equatable>(
        _ cached: CachedResult<Value>?, key: CacheKey?
    ) -> Loadable<Value> {
        guard let cached else { return .idle }
        return .loaded(cached.value, stale: key == nil || cached.key != key)
    }
}
