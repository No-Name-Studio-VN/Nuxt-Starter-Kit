/// Decides which cached preview and inspect results can be reused and which renders must run
/// (spec 2.3). Pure, so the cache rules are testable.
///
/// Only a project the local kit checkout can serve (default template, commit on main, `origin/main`
/// known) is rendered automatically. Everything else would make the CLI fetch the recorded template
/// over the network, so it renders only on an explicit request.
public enum RenderPlanner {
    public struct Input: Sendable {
        public let state: KitState
        /// Working-tree fingerprint; nil when the folder is not a git repository.
        public let fingerprint: String?
        public let availability: CommitAvailability?
        public let behind: Int?
        public let latestMain: String?
        public let cliReady: Bool
        public let cachedPreview: CachedResult<TransitionReport>?
        public let cachedInspect: CachedResult<InspectReport>?
        public let previewFailure: CachedFailure?
        public let inspectFailure: CachedFailure?

        public init(
            state: KitState, fingerprint: String?, availability: CommitAvailability?, behind: Int?,
            latestMain: String?, cliReady: Bool, cachedPreview: CachedResult<TransitionReport>? = nil,
            cachedInspect: CachedResult<InspectReport>? = nil, previewFailure: CachedFailure? = nil,
            inspectFailure: CachedFailure? = nil
        ) {
            self.state = state
            self.fingerprint = fingerprint
            self.availability = availability
            self.behind = behind
            self.latestMain = latestMain
            self.cliReady = cliReady
            self.cachedPreview = cachedPreview
            self.cachedInspect = cachedInspect
            self.previewFailure = previewFailure
            self.inspectFailure = inspectFailure
        }
    }

    public static func plan(_ input: Input) -> RenderPlan {
        let localTarget = input.availability == .onMain ? input.latestMain : nil
        let canRender = input.cliReady && input.fingerprint != nil && localTarget != nil

        let inspectKey = input.fingerprint.map {
            CacheKey(fingerprint: $0, recordedCommit: input.state.commit, targetCommit: localTarget ?? "")
        }
        let inspect = resolve(
            cached: input.cachedInspect, failure: input.inspectFailure, key: inspectKey, canRender: canRender)
        let inspectJob = inspect.needsRender
            ? RenderJob(recordedCommit: input.state.commit, source: .local, target: localTarget) : nil

        var preview = Loadable<TransitionReport>.idle
        var previewJob: RenderJob?
        if let behind = input.behind, let localTarget {
            // Up to date: there is nothing to preview.
            if behind > 0 {
                let key = input.fingerprint.map {
                    CacheKey(fingerprint: $0, recordedCommit: input.state.commit, targetCommit: localTarget)
                }
                let resolved = resolve(
                    cached: input.cachedPreview, failure: input.previewFailure, key: key, canRender: canRender)
                preview = resolved.state
                if resolved.needsRender {
                    previewJob = RenderJob(recordedCommit: input.state.commit, source: .local, target: localTarget)
                }
            }
        } else if let cached = input.cachedPreview {
            // Not served by the local checkout: show what an earlier explicit preview found.
            preview = .loaded(cached.value, stale: true)
        }
        return RenderPlan(
            preview: preview, inspect: inspect.state, previewJob: previewJob, inspectJob: inspectJob)
    }

    /// The job for an explicit "Preview again" or inspect: local when the checkout can serve the
    /// project, otherwise the recorded template.
    public static func job(for snapshot: ProjectSnapshot, latestMain: String?) -> RenderJob? {
        guard let state = snapshot.kitState else { return nil }
        let local = snapshot.availability == .onMain ? latestMain : nil
        return RenderJob(recordedCommit: state.commit, source: local == nil ? .recorded : .local, target: local)
    }

    private struct Resolution<Value: Sendable & Equatable> {
        let state: Loadable<Value>
        let needsRender: Bool
    }

    /// A cached value is fresh only when its key matches. A failure recorded for the current key is
    /// shown instead of being retried; anything else is stale until the render runs.
    private static func resolve<Value: Codable & Sendable & Equatable>(
        cached: CachedResult<Value>?, failure: CachedFailure?, key: CacheKey?, canRender: Bool
    ) -> Resolution<Value> {
        if let key {
            if let cached, cached.key == key {
                return Resolution(state: .loaded(cached.value, stale: false), needsRender: false)
            }
            if let failure, failure.key == key {
                return Resolution(state: .failed(failure.message), needsRender: false)
            }
        }
        let shown: Loadable<Value> = cached.map { .loaded($0.value, stale: true) } ?? .idle
        guard canRender else { return Resolution(state: shown, needsRender: false) }
        return Resolution(state: shown == .idle ? .loading : shown, needsRender: true)
    }
}
