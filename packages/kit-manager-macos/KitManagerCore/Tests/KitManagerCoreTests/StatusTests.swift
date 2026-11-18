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
        #expect(ProjectStatus(snapshot: behind) == .behind(4, PreviewSummary(report: preview)))
        #expect(ProjectStatus(snapshot: snapshot(behind: 4)) == .behind(4, nil))
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
}
