import Foundation
import Testing

@testable import KitManagerCore

private let recorded = "bead6d4c1e7989d369942a70c35cba50c187006d"
private let main = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
private let defaultKit = "github:No-Name-Studio-VN/Nuxt-Starter-Kit"

private func state(kit: String = defaultKit) -> KitState {
    KitState(
        version: 3, kit: kit, commit: recorded, modules: [],
        identity: KitIdentity(name: "Acme", description: ""), conflicts: [])
}

private func report() -> TransitionReport {
    TransitionReport(
        schema: 1, from: recorded, to: main, changes: [FileChangeSummary(path: "a", kind: .merge)],
        conflicts: [], followUps: [], addedModules: [], removedModules: [], applied: false, upToDate: false)
}

private func inspectReport() -> InspectReport {
    InspectReport(
        schema: 1, commit: recorded, kit: defaultKit, modules: [],
        identity: KitIdentity(name: "Acme", description: ""),
        conflicts: InspectConflicts(recorded: [], unresolved: []), files: [],
        summary: InspectSummary(
            total: 0, unchanged: 0, edited: 0, deleted: 0, protected: 0, expected: 0, scored: 0, scoredChanged: 0))
}

private func key(fingerprint: String = "f1", recordedCommit: String = recorded, target: String = main) -> CacheKey {
    CacheKey(fingerprint: fingerprint, recordedCommit: recordedCommit, targetCommit: target)
}

private func cached<Value: Codable & Sendable & Equatable>(_ value: Value, _ key: CacheKey) -> CachedResult<Value> {
    CachedResult(key: key, value: value, checkedAt: Date(timeIntervalSince1970: 0))
}

private func input(
    kit: String = defaultKit, fingerprint: String? = "f1", availability: CommitAvailability? = .onMain,
    behind: Int? = 3, latestMain: String? = main, cliReady: Bool = true,
    preview: CachedResult<TransitionReport>? = nil, inspect: CachedResult<InspectReport>? = nil,
    previewFailure: CachedFailure? = nil, inspectFailure: CachedFailure? = nil
) -> RenderPlanner.Input {
    RenderPlanner.Input(
        state: state(kit: kit), fingerprint: fingerprint, availability: availability, behind: behind,
        latestMain: latestMain, cliReady: cliReady, cachedPreview: preview, cachedInspect: inspect,
        previewFailure: previewFailure, inspectFailure: inspectFailure)
}

@Suite("Render planner")
struct RenderPlannerTests {
    @Test func nothingCachedQueuesBothRenders() {
        let plan = RenderPlanner.plan(input())
        #expect(plan.preview == .loading)
        #expect(plan.inspect == .loading)
        #expect(plan.previewJob == RenderJob(recordedCommit: recorded, source: .local, target: main))
        #expect(plan.inspectJob == RenderJob(recordedCommit: recorded, source: .local, target: main))
    }

    @Test func matchingKeyReusesResultsWithoutRendering() {
        let plan = RenderPlanner.plan(
            input(preview: cached(report(), key()), inspect: cached(inspectReport(), key(target: ""))))
        #expect(plan.preview == .loaded(report(), stale: false))
        #expect(plan.inspect == .loaded(inspectReport(), stale: false))
        #expect(plan.previewJob == nil)
        #expect(plan.inspectJob == nil)
    }

    @Test(arguments: [
        key(fingerprint: "f2"), key(recordedCommit: "other"), key(target: "bbbb"),
    ])
    func eachKeyMismatchIsStaleAndRendersAgain(mismatched: CacheKey) {
        let plan = RenderPlanner.plan(input(preview: cached(report(), mismatched)))
        #expect(plan.preview == .loaded(report(), stale: true))
        #expect(plan.previewJob != nil)
    }

    @Test(arguments: [
        key(fingerprint: "f2", target: ""), key(recordedCommit: "other", target: ""),
    ])
    func inspectIsStaleOnlyWhenTheWorkingTreeOrRecordedCommitChanges(mismatched: CacheKey) {
        let plan = RenderPlanner.plan(input(inspect: cached(inspectReport(), mismatched)))
        #expect(plan.inspect == .loaded(inspectReport(), stale: true))
        #expect(plan.inspectJob != nil)
    }

    @Test func movingMainDoesNotRerunInspect() {
        // Inspect renders only the recorded commit, so a result computed against an older main is still fresh.
        let older = cached(inspectReport(), key(target: ""))
        let plan = RenderPlanner.plan(input(latestMain: "cccccccccccccccccccccccccccccccccccccccc", inspect: older))
        #expect(plan.inspect == .loaded(inspectReport(), stale: false))
        #expect(plan.inspectJob == nil)
    }

    @Test func failureForTheCurrentKeyIsShownAndNotRetried() {
        let plan = RenderPlanner.plan(
            input(
                previewFailure: CachedFailure(key: key(), message: "boom"),
                inspectFailure: CachedFailure(key: key(target: ""), message: "boom")))
        #expect(plan.preview == .failed("boom"))
        #expect(plan.inspect == .failed("boom"))
        #expect(plan.previewJob == nil)
        #expect(plan.inspectJob == nil)
    }

    @Test func failureForAnotherKeyIsRetried() {
        let failure = CachedFailure(key: key(fingerprint: "old", target: ""), message: "boom")
        let plan = RenderPlanner.plan(input(previewFailure: failure, inspectFailure: failure))
        #expect(plan.preview == .loading)
        #expect(plan.previewJob != nil)
        #expect(plan.inspectJob != nil)
    }

    @Test func upToDateProjectsAreNotPreviewed() {
        let plan = RenderPlanner.plan(input(behind: 0))
        #expect(plan.preview == .idle)
        #expect(plan.previewJob == nil)
        #expect(plan.inspectJob != nil)
    }

    @Test func recordedSourceProjectsAreNeverRenderedAutomatically() {
        let fork = RenderPlanner.plan(input(kit: "github:someone/fork", availability: nil, behind: nil))
        #expect(fork.previewJob == nil)
        #expect(fork.inspectJob == nil)
        #expect(fork.inspect == .idle)

        let notOnMain = RenderPlanner.plan(input(availability: .notOnMain, behind: nil))
        #expect(notOnMain.previewJob == nil)
        #expect(notOnMain.inspectJob == nil)

        // An earlier explicit preview is still shown, as stale.
        let remembered = RenderPlanner.plan(
            input(availability: .notOnMain, behind: nil, preview: cached(report(), key(target: "x"))))
        #expect(remembered.preview == .loaded(report(), stale: true))
        #expect(remembered.previewJob == nil)
    }

    @Test func explicitPreviewFailureOnARecordedSourceProjectSurvivesTheNextRefresh() {
        // An explicit preview of a pinned project, fork or off-main commit renders from the recorded
        // template, so it is keyed with an empty target.
        let failure = CachedFailure(key: key(target: ""), message: "offline")
        for plan in [
            RenderPlanner.plan(input(kit: "\(defaultKit)#v3.0.2", behind: nil, previewFailure: failure)),
            RenderPlanner.plan(input(kit: "github:someone/fork", availability: nil, behind: nil, previewFailure: failure)),
            RenderPlanner.plan(input(availability: .notOnMain, behind: nil, previewFailure: failure)),
        ] {
            #expect(plan.preview == .failed("offline"))
            #expect(plan.previewJob == nil)
        }

        // The failure wins over an older successful preview for the same working tree.
        let older = RenderPlanner.plan(
            input(behind: nil, preview: cached(report(), key(target: "x")), previewFailure: failure))
        #expect(older.preview == .failed("offline"))

        // Once the working tree changes the failure no longer applies.
        let moved = RenderPlanner.plan(
            input(
                behind: nil, preview: cached(report(), key(target: "x")),
                previewFailure: CachedFailure(key: key(fingerprint: "old", target: ""), message: "offline")))
        #expect(moved.preview == .loaded(report(), stale: true))
        let none = RenderPlanner.plan(
            input(
                behind: nil, previewFailure: CachedFailure(key: key(fingerprint: "old", target: ""), message: "offline")))
        #expect(none.preview == .idle)
    }

    @Test func missingFingerprintOrCLIOrMainRendersNothing() {
        #expect(RenderPlanner.plan(input(fingerprint: nil)).previewJob == nil)
        #expect(RenderPlanner.plan(input(cliReady: false)).inspectJob == nil)
        let offline = RenderPlanner.plan(input(availability: nil, behind: nil, latestMain: nil))
        #expect(offline.inspectJob == nil)
        // Without a fingerprint a cached value cannot be validated, so it is stale.
        let unvalidated = RenderPlanner.plan(
            input(fingerprint: nil, preview: cached(report(), key()), inspect: cached(inspectReport(), key())))
        #expect(unvalidated.preview == .loaded(report(), stale: true))
        #expect(unvalidated.inspect == .loaded(inspectReport(), stale: true))
    }

    @Test func explicitJobsUseTheLocalCheckoutOnlyWhenItCanServeTheProject() {
        let onMain = ProjectSnapshot(kind: .kitV3(state()), availability: .onMain, behind: 1)
        let local = RenderJob(recordedCommit: recorded, source: .local, target: main)
        #expect(RenderPlanner.previewJob(for: onMain, latestMain: main) == local)
        #expect(RenderPlanner.inspectJob(for: onMain, latestMain: main) == local)

        let notOnMain = ProjectSnapshot(kind: .kitV3(state()), availability: .notOnMain)
        let remote = RenderJob(recordedCommit: recorded, source: .recorded, target: nil)
        #expect(RenderPlanner.previewJob(for: notOnMain, latestMain: main) == remote)
        #expect(RenderPlanner.inspectJob(for: notOnMain, latestMain: main) == remote)

        let fork = ProjectSnapshot(kind: .kitV3(state(kit: "github:someone/fork")))
        #expect(RenderPlanner.previewJob(for: fork, latestMain: main)?.source == .recorded)
        #expect(RenderPlanner.previewJob(for: onMain, latestMain: nil)?.source == .recorded)
        #expect(RenderPlanner.previewJob(for: ProjectSnapshot(kind: .nuxt), latestMain: main) == nil)
    }

    @Test func pinnedProjectsPreviewFromTheRecordedTemplateButInspectLocally() {
        let pinned = ProjectSnapshot(
            kind: .kitV3(state(kit: "\(defaultKit)#v3.0.2")), availability: .onMain)
        // The pin must be respected, so the preview never follows main through the local checkout.
        #expect(
            RenderPlanner.previewJob(for: pinned, latestMain: main)
                == RenderJob(recordedCommit: recorded, source: .recorded, target: nil))
        // Inspect renders only the recorded commit, which the local clone has.
        #expect(
            RenderPlanner.inspectJob(for: pinned, latestMain: main)
                == RenderJob(recordedCommit: recorded, source: .local, target: main))

        // Planning never previews a pinned project on its own (no behind count), but may inspect it.
        let plan = RenderPlanner.plan(input(kit: "\(defaultKit)#v3.0.2", behind: nil))
        #expect(plan.previewJob == nil)
        #expect(plan.inspectJob == RenderJob(recordedCommit: recorded, source: .local, target: main))
    }

    @Test func inspectCacheKeyIgnoresTheTarget() {
        let local = RenderJob(recordedCommit: recorded, source: .local, target: main)
        #expect(local.inspectCacheKey(fingerprint: "f1") == key(target: ""))
        let remote = RenderJob(recordedCommit: recorded, source: .recorded, target: nil)
        #expect(remote.inspectCacheKey(fingerprint: "f1") == key(target: ""))
    }

    @Test func jobCacheKeyUsesTheReportTargetOnlyForRecordedSource() {
        let local = RenderJob(recordedCommit: recorded, source: .local, target: main)
        #expect(local.cacheKey(fingerprint: "f1", resolvedTarget: "zzz") == key())

        let remote = RenderJob(recordedCommit: recorded, source: .recorded, target: nil)
        #expect(remote.cacheKey(fingerprint: "f1", resolvedTarget: "zzz") == key(target: "zzz"))
        #expect(remote.cacheKey(fingerprint: "f1") == key(target: ""))
    }

    @Test func productionURLPrefersWranglerThenTheOverride() {
        let wrangler = WranglerInfo(workerName: "w", routes: ["a.example.com"], productionURL: URL(string: "https://a.example.com"))
        #expect(ProductionURL.resolve(wrangler: wrangler, override: "b.example.com")?.host() == "a.example.com")
        #expect(ProductionURL.resolve(wrangler: nil, override: "b.example.com")?.absoluteString == "https://b.example.com")
        #expect(ProductionURL.resolve(wrangler: nil, override: " http://c.test ")?.absoluteString == "http://c.test")
        #expect(ProductionURL.resolve(wrangler: nil, override: "ftp://x.test") == nil)
        #expect(ProductionURL.resolve(wrangler: nil, override: "  ") == nil)
        #expect(ProductionURL.resolve(wrangler: nil, override: nil) == nil)
    }
}
