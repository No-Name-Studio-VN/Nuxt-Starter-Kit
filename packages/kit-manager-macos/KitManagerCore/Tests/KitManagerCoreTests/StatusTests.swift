import Foundation
import Testing

@testable import KitManagerCore

private let sha = "bead6d4c1e7989d369942a70c35cba50c187006d"
private let defaultKit = "github:No-Name-Studio-VN/Nuxt-Starter-Kit"

private func state(kit: String = defaultKit, conflicts: [String] = []) -> KitState {
    KitState(
        version: 3, kit: kit, commit: sha, modules: ["auth"],
        identity: KitIdentity(name: "Acme", description: "Acme app"), conflicts: conflicts)
}

private func report(changes: [FileChangeSummary] = [], conflicts: [String] = []) -> TransitionReport {
    TransitionReport(
        schema: 1, from: sha, to: String(repeating: "a", count: 40), changes: changes, conflicts: conflicts,
        followUps: [], addedModules: [], removedModules: [], applied: false, upToDate: false)
}

private func inspectReport(unresolved: [String]) -> InspectReport {
    InspectReport(
        schema: 1, commit: sha, kit: defaultKit, modules: ["auth"],
        identity: KitIdentity(name: "Acme", description: "Acme app"),
        conflicts: InspectConflicts(recorded: unresolved, unresolved: unresolved), files: [],
        summary: InspectSummary(
            total: 0, unchanged: 0, edited: 0, deleted: 0, protected: 0, expected: 0, scored: 0, scoredChanged: 0))
}

/// A kit v3 project on the default template, already checked against main.
private func snapshot(
    kit: String = defaultKit, conflicts: [String] = [], availability: CommitAvailability? = .onMain,
    behind: Int? = 0
) -> ProjectSnapshot {
    ProjectSnapshot(
        kind: .kitV3(state(kit: kit, conflicts: conflicts)), availability: availability, behind: behind)
}

@Suite("Project status")
struct StatusTests {
    @Test func statusPrecedence() {
        // A missing folder wins over everything else the snapshot claims.
        let missing = ProjectSnapshot(kind: .missing, availability: .notOnMain, behind: 3)
        #expect(ProjectStatus(snapshot: missing) == .missing)

        #expect(ProjectStatus(snapshot: ProjectSnapshot(kind: .invalidState("bad"))) == .invalid("bad"))
        #expect(ProjectStatus(snapshot: ProjectSnapshot(kind: .kitLegacy)) == .needsMigration(.legacy))
        #expect(ProjectStatus(snapshot: ProjectSnapshot(kind: .nuxt)) == .needsMigration(.nuxt))
        #expect(ProjectStatus(snapshot: ProjectSnapshot(kind: .other)) == .needsMigration(.other))

        // Recorded conflicts beat "not on main" and "behind".
        #expect(
            ProjectStatus(snapshot: snapshot(conflicts: ["a"], availability: .notOnMain, behind: 4))
                == .unresolvedConflicts(1))

        #expect(
            ProjectStatus(snapshot: snapshot(availability: .notOnMain, behind: nil))
                == .commitNotOnMain(shortSHA: "bead6d4"))
        #expect(ProjectStatus(snapshot: snapshot(behind: 0)) == .upToDate)

        var behind = snapshot(behind: 4)
        let preview = report(
            changes: [
                FileChangeSummary(path: "a", kind: .merge), FileChangeSummary(path: "b", kind: .update),
            ])
        behind.preview = .loaded(preview, stale: false)
        #expect(
            ProjectStatus(snapshot: behind) == .behind(4, .ready(PreviewSummary(report: preview), stale: false)))
        #expect(ProjectStatus(snapshot: snapshot(behind: 4)) == .behind(4, .pending))
    }

    @Test func behindDistinguishesRunningStaleAndFailedPreviews() {
        let preview = report(changes: [FileChangeSummary(path: "a", kind: .merge)])
        let summary = PreviewSummary(report: preview)

        var running = snapshot(behind: 2)
        running.preview = .loading
        #expect(ProjectStatus(snapshot: running) == .behind(2, .pending))

        var stale = snapshot(behind: 2)
        stale.preview = .loaded(preview, stale: true)
        #expect(ProjectStatus(snapshot: stale) == .behind(2, .ready(summary, stale: true)))

        var failed = snapshot(behind: 2)
        failed.preview = .failed("render exploded")
        #expect(ProjectStatus(snapshot: failed) == .behind(2, .failed("render exploded")))
    }

    @Test func failedKitCheckIsVisibleInsteadOfChecking() {
        // On main, but git could not count the commits behind: not "checking" forever.
        var broken = snapshot(availability: .onMain, behind: nil)
        broken.kitCheckFailure = "git rev-list failed"
        #expect(ProjectStatus(snapshot: broken) == .checkFailed("git rev-list failed"))

        // A count that did arrive wins over a stale failure message.
        var recovered = snapshot(availability: .onMain, behind: 0)
        recovered.kitCheckFailure = "old"
        #expect(ProjectStatus(snapshot: recovered) == .upToDate)
    }

    @Test func loadedInspectOverridesRecordedConflicts() {
        var resolved = snapshot(conflicts: ["a", "b"])
        resolved.inspect = .loaded(inspectReport(unresolved: []), stale: false)
        #expect(ProjectStatus(snapshot: resolved) == .upToDate)

        var unresolved = snapshot()
        unresolved.inspect = .loaded(inspectReport(unresolved: ["x", "y", "z"]), stale: true)
        #expect(ProjectStatus(snapshot: unresolved) == .unresolvedConflicts(3))
    }

    @Test func checkingUntilAvailabilityIsKnown() {
        #expect(ProjectStatus(snapshot: snapshot(availability: nil, behind: nil)) == .checking)
        #expect(ProjectStatus(snapshot: snapshot(availability: .onMain, behind: nil)) == .checking)
    }

    @Test func otherTemplateWhenKitIsAFork() {
        #expect(ProjectStatus(snapshot: snapshot(kit: "github:someone/fork")) == .otherTemplate)
    }

    @Test func defaultTemplateMatchesOnlyTheKitOnMain() {
        #expect(snapshot(kit: defaultKit).usesDefaultTemplate)
        #expect(snapshot(kit: "\(defaultKit)#main").usesDefaultTemplate)
        #expect(!snapshot(kit: "\(defaultKit)#next").usesDefaultTemplate)
        // A fork that happens to track `main` is still another template.
        #expect(!snapshot(kit: "github:someone/fork#main").usesDefaultTemplate)
        #expect(ProjectStatus(snapshot: snapshot(kit: "github:someone/fork#main")) == .otherTemplate)
        #expect(!ProjectSnapshot(kind: .nuxt).usesDefaultTemplate)
    }

    @Test func attentionReasons() {
        var troubled = snapshot(behind: 2)
        troubled.env = EnvCheck(hasExample: true, hasEnv: true, missing: ["A", "B"])
        troubled.health = SiteHealth(statusCode: 503, latency: .milliseconds(80), error: nil)
        #expect(AttentionReason.reasons(for: troubled) == [.behind, .missingEnvKeys(2), .siteDown])

        var healthy = snapshot(behind: 0)
        healthy.env = EnvCheck(hasExample: true, hasEnv: true, missing: [])
        healthy.health = SiteHealth(statusCode: 200, latency: .milliseconds(80), error: nil)
        #expect(AttentionReason.reasons(for: healthy).isEmpty)
    }

    @Test func attentionReasonsForStructuralProblems() {
        #expect(AttentionReason.reasons(for: ProjectSnapshot(kind: .missing)) == [.missing])
        #expect(AttentionReason.reasons(for: ProjectSnapshot(kind: .invalidState("bad"))) == [.invalid])
        #expect(AttentionReason.reasons(for: ProjectSnapshot(kind: .kitLegacy)) == [.migration])
        #expect(AttentionReason.reasons(for: snapshot(conflicts: ["a"])) == [.conflicts])
        // A site that failed to connect has no status code but is still down.
        var offline = snapshot()
        offline.health = SiteHealth(statusCode: nil, latency: nil, error: "timed out")
        #expect(AttentionReason.reasons(for: offline) == [.siteDown])
    }

    @Test func previewSummaryCounts() {
        let summary = PreviewSummary(
            report: report(
                changes: [
                    FileChangeSummary(path: "a", kind: .merge), FileChangeSummary(path: "b", kind: .merge),
                    FileChangeSummary(path: "c", kind: .conflict),
                ],
                conflicts: ["c"]))
        #expect(summary.counts[.merge] == 2)
        #expect(summary.conflicts == 1)
        #expect(summary.files == 3)
    }

    @Test func cacheKeyMismatchIsStale() {
        let key = CacheKey(fingerprint: "f1", recordedCommit: sha, targetCommit: "t1")
        #expect(key == CacheKey(fingerprint: "f1", recordedCommit: sha, targetCommit: "t1"))
        #expect(key != CacheKey(fingerprint: "f2", recordedCommit: sha, targetCommit: "t1"))
        #expect(key != CacheKey(fingerprint: "f1", recordedCommit: "other", targetCommit: "t1"))
        #expect(key != CacheKey(fingerprint: "f1", recordedCommit: sha, targetCommit: "t2"))
    }

    @Test func cachedResultsSurviveEncoding() throws {
        let key = CacheKey(fingerprint: "f1", recordedCommit: sha, targetCommit: "t1")
        let summary = PreviewSummary(
            report: report(changes: [FileChangeSummary(path: "a", kind: .keepEdited)], conflicts: []))
        let cached = CachedResult(key: key, value: summary, checkedAt: Date(timeIntervalSince1970: 1_000))
        let decoded = try JSONDecoder().decode(CachedResult<PreviewSummary>.self, from: JSONEncoder().encode(cached))
        #expect(decoded == cached)
        #expect(decoded.value.counts[.keepEdited] == 1)
    }

    @Test func pinnedTemplateIsNotAnotherTemplate() {
        let pinned = snapshot(kit: "\(defaultKit)#v3.0.2", availability: .onMain, behind: nil)
        #expect(ProjectStatus(snapshot: pinned) == .pinned(ref: "v3.0.2"))
        #expect(!pinned.usesDefaultTemplate)
        #expect(ProjectStatus(snapshot: snapshot(kit: "\(defaultKit)#next")) == .pinned(ref: "next"))
        // Recorded conflicts still come first.
        #expect(
            ProjectStatus(snapshot: snapshot(kit: "\(defaultKit)#v3.0.2", conflicts: ["a"])) == .unresolvedConflicts(1))
        #expect(AttentionReason.reasons(for: pinned).isEmpty)
    }

    @Test func onlyAnotherRepositoryIsOtherTemplate() {
        #expect(ProjectStatus(snapshot: snapshot(kit: "github:someone/fork")) == .otherTemplate)
        #expect(ProjectStatus(snapshot: snapshot(kit: "github:someone/fork#main")) == .otherTemplate)
        #expect(ProjectStatus(snapshot: snapshot(kit: "github:someone/fork#v3.0.2")) == .otherTemplate)
        // A repository whose name merely starts with the kit's is another repository.
        #expect(ProjectStatus(snapshot: snapshot(kit: "\(defaultKit)-fork#v1")) == .otherTemplate)
    }

    @Test func defaultTemplateWithNoRefOrMainBehavesNormally() {
        #expect(ProjectStatus(snapshot: snapshot(kit: defaultKit, behind: 0)) == .upToDate)
        #expect(ProjectStatus(snapshot: snapshot(kit: "\(defaultKit)#main", behind: 0)) == .upToDate)
        #expect(ProjectStatus(snapshot: snapshot(kit: "\(defaultKit)#main", behind: 2)) == .behind(2, .pending))
        #expect(KitState.defaultTemplate == defaultKit)
        let main = state(kit: "\(defaultKit)#main")
        #expect(main.pinnedRef == nil)
        #expect(main.templateRef == "main")
        #expect(state(kit: defaultKit).templateRef == nil)
    }

    @Test func kitCheckoutIsAKitSourceNotAMigrationCandidate() {
        for kind in [ProjectKind.nuxt, .other, .kitLegacy] {
            let source = ProjectSnapshot(kind: kind, isKitSource: true)
            #expect(ProjectStatus(snapshot: source) == .kitSource)
            #expect(AttentionReason.reasons(for: source).isEmpty)
        }
        // A missing or invalid folder is still reported as such.
        #expect(ProjectStatus(snapshot: ProjectSnapshot(kind: .missing, isKitSource: true)) == .missing)
        // The same folder without the flag is an ordinary Nuxt project that needs migration.
        #expect(ProjectStatus(snapshot: ProjectSnapshot(kind: .nuxt)) == .needsMigration(.nuxt))
        // Env and site problems still count.
        var source = ProjectSnapshot(kind: .nuxt, isKitSource: true)
        source.env = EnvCheck(hasExample: true, hasEnv: true, missing: ["A"])
        #expect(AttentionReason.reasons(for: source) == [.missingEnvKeys(1)])
    }

    @Test func kitCheckoutMatchesByStandardizedPath() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let kit = temp.url.appending(path: "Nuxt-Starter-Kit")
        let other = temp.url.appending(path: "other")
        let link = temp.url.appending(path: "link")
        try FileManager.default.createDirectory(at: kit, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: other, withIntermediateDirectories: true)
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: kit)

        #expect(KitCheckout.isSource(kit, kitRoot: kit))
        #expect(KitCheckout.isSource(URL(filePath: kit.path + "/"), kitRoot: kit))
        #expect(KitCheckout.isSource(kit.appending(path: "x/.."), kitRoot: kit))
        #expect(KitCheckout.isSource(link, kitRoot: kit))
        #expect(!KitCheckout.isSource(other, kitRoot: kit))
        #expect(!KitCheckout.isSource(kit.appending(path: "packages"), kitRoot: kit))
        #expect(!KitCheckout.isSource(kit, kitRoot: nil))
    }
}
