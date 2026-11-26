import Foundation
import Testing

@testable import KitManagerCore

private let defaultKit = "github:No-Name-Studio-VN/Nuxt-Starter-Kit"

private func commit(_ id: String, modules: Set<String> = ["base"], day: Int = 0) -> KitCommit {
    KitCommit(
        id: id, subject: "feat: \(id)", type: "feat", scope: nil, breaking: false,
        date: Date(timeIntervalSince1970: TimeInterval(day * 86_400)), modules: modules)
}

private func module(_ id: String, internal isInternal: Bool = false) -> KitModuleInfo {
    KitModuleInfo(
        id: id, title: id, description: "", requires: [], internal: isInternal, dependencies: [],
        devDependencies: [], scripts: [], env: [], bindings: [], rootFiles: [])
}

private func project(
    modules: [String] = [], kit: String = defaultKit, behind: Int? = 0, availability: CommitAvailability? = .onMain,
    changelog: [KitCommit] = [], isKitSource: Bool = false
) -> ProjectSnapshot {
    let state = KitState(
        version: 3, kit: kit, commit: String(repeating: "a", count: 40), modules: modules,
        identity: KitIdentity(name: "Acme", description: "Acme app"), conflicts: [])
    return ProjectSnapshot(
        kind: .kitV3(state), isKitSource: isKitSource, availability: availability, behind: behind,
        changelog: changelog)
}

@Suite("Overview logic")
struct OverviewTests {
    // MARK: Release sections

    @Test func commitsGroupUnderTheTagTheyShipIn() {
        let commits = [commit("e"), commit("d"), commit("c"), commit("b"), commit("a")]
        let sections = ReleaseGrouper.sections(
            commits: commits, tags: ["d": ["v1.1.0"], "b": ["v1.0.0"]])
        #expect(sections.map(\.tag) == [nil, "v1.1.0", "v1.0.0"])
        #expect(sections.map { $0.commits.map(\.id) } == [["e"], ["d", "c"], ["b", "a"]])
    }

    @Test func newestCommitTaggedLeavesNoUnreleasedSection() {
        let sections = ReleaseGrouper.sections(commits: [commit("b"), commit("a")], tags: ["b": ["v2.0.0"]])
        #expect(sections.map(\.tag) == ["v2.0.0"])
        #expect(sections.first?.commits.count == 2)
    }

    @Test func noTagsMeansOneUnreleasedSection() {
        let sections = ReleaseGrouper.sections(commits: [commit("b"), commit("a")], tags: [:])
        #expect(sections == [ReleaseSection(tag: nil, commits: [commit("b"), commit("a")])])
        #expect(ReleaseGrouper.sections(commits: [], tags: ["x": ["v1.0.0"]]).isEmpty)
    }

    @Test func severalTagsOnOneCommitPickTheHighestVersion() {
        let sections = ReleaseGrouper.sections(
            commits: [commit("a")], tags: ["a": ["v3.9.0", "v3.10.0", "v3.2.0"]])
        #expect(sections.map(\.tag) == ["v3.10.0"])
    }

    // MARK: Changelog range

    @Test func rangeSkipsProjectsThatAreNotTrackedOnMain() {
        let other = project(kit: "github:acme/fork", behind: 50)
        let offMain = project(behind: nil, availability: .notOnMain)
        let unknown = project(behind: nil, availability: nil)
        let source = project(behind: 40, isKitSource: true)
        let legacy = ProjectSnapshot(kind: .kitLegacy)
        #expect(ChangelogRange.oldestCommit(in: [other, offMain, unknown, source, legacy]) == nil)
        #expect(ChangelogRange.oldestCommit(in: []) == nil)
    }

    @Test func rangePicksTheMostBehindProject() {
        func at(_ letter: Character, behind: Int) -> ProjectSnapshot {
            let state = KitState(
                version: 3, kit: defaultKit, commit: String(repeating: letter, count: 40), modules: [],
                identity: KitIdentity(name: "x", description: "x"), conflicts: [])
            return ProjectSnapshot(kind: .kitV3(state), availability: .onMain, behind: behind)
        }
        #expect(
            ChangelogRange.oldestCommit(in: [at("b", behind: 2), at("c", behind: 9), at("d", behind: 4)])
                == String(repeating: "c", count: 40))
    }

    // MARK: Modules matrix

    @Test func matrixColumnsAreKitV3ProjectsOnly() {
        let v3 = project(modules: ["auth"])
        let source = project(modules: ["auth"], isKitSource: true)
        let legacy = ProjectSnapshot(kind: .kitLegacy)
        let nuxt = ProjectSnapshot(kind: .nuxt)
        let ids = (0..<4).map { _ in UUID() }
        let columns = ModuleMatrix.columns(from: [(ids[0], v3), (ids[1], source), (ids[2], legacy), (ids[3], nuxt)])
        #expect(columns.map(\.id) == [ids[0]])
        #expect(columns.first?.installed == ["auth"])
    }

    @Test func matrixCountsInstalledAndBehind() {
        let a = UUID()
        let b = UUID()
        let c = UUID()
        let columns = [
            // Installed `auth`, and a commit touching `auth` is pending.
            ModuleMatrix.Column(
                id: a, snapshot: project(modules: ["auth", "content"], changelog: [commit("1", modules: ["auth"])])),
            // Installed `auth`, but only `content` changed.
            ModuleMatrix.Column(
                id: b, snapshot: project(modules: ["auth"], changelog: [commit("2", modules: ["content"])])),
            // Did not install `auth`: a pending auth commit does not count as behind.
            ModuleMatrix.Column(
                id: c, snapshot: project(modules: ["content"], changelog: [commit("3", modules: ["auth"])])),
        ]
        let rows = ModuleMatrix.rows(catalogue: [module("auth"), module("content"), module("pwa")], columns: columns)
        #expect(rows.map(\.module.id) == ["auth", "content", "pwa"])

        #expect(rows[0].installed == [a, b])
        #expect(rows[0].installedCount == 2)
        #expect(rows[0].behind == [a])
        #expect(rows[0].behindCount == 1)

        #expect(rows[1].installed == [a, c])
        #expect(rows[1].behind.isEmpty)
        #expect(rows[1].behindCount == 0)

        #expect(rows[2].installedCount == 0)
        #expect(rows[2].behindCount == 0)
    }

    @Test func matrixKeepsCatalogueOrderAndInternalFlag() {
        let rows = ModuleMatrix.rows(catalogue: [module("zeta"), module("alpha", internal: true)], columns: [])
        #expect(rows.map(\.module.id) == ["zeta", "alpha"])
        #expect(rows.map(\.module.internal) == [false, true])
    }

    // MARK: Switcher ranking

    private func candidate(_ name: String, path: String = "/work") -> SwitcherCandidate {
        SwitcherCandidate(id: UUID(), name: name, path: path)
    }

    @Test func emptyQueryKeepsEveryProjectInOrder() {
        let items = [candidate("zeta"), candidate("alpha")]
        #expect(SwitcherRanking.rank(query: "  ", candidates: items) == items.map(\.id))
    }

    @Test func subsequenceMatchesNameCaseInsensitively() {
        let manager = candidate("kit-manager")
        let other = candidate("billing")
        #expect(SwitcherRanking.rank(query: "KMG", candidates: [other, manager]) == [manager.id])
        #expect(SwitcherRanking.rank(query: "zzz", candidates: [other, manager]).isEmpty)
    }

    @Test func orderMattersForSubsequence() {
        let item = candidate("abc")
        #expect(SwitcherRanking.rank(query: "cba", candidates: [item]).isEmpty)
    }

    @Test func longerContiguousRunRanksFirst() {
        let scattered = candidate("a-p-p")
        let solid = candidate("my-app-web")
        #expect(SwitcherRanking.rank(query: "app", candidates: [scattered, solid]) == [solid.id, scattered.id])
    }

    @Test func equalRunsPreferTheShorterName() {
        let long = candidate("acme-dashboard")
        let short = candidate("acme")
        #expect(SwitcherRanking.rank(query: "acme", candidates: [long, short]) == [short.id, long.id])
    }

    @Test func pathMatchesWhenTheNameDoesNot() {
        let item = candidate("website", path: "/Users/me/clients/acme/website")
        let miss = candidate("blog", path: "/Users/me/blog")
        #expect(SwitcherRanking.rank(query: "acme", candidates: [miss, item]) == [item.id])
    }

    @Test func nameBeatsPathOnlyMatchOfEqualRun() {
        let named = candidate("acme")
        let pathOnly = candidate("a", path: "/clients/acme")
        #expect(SwitcherRanking.rank(query: "acme", candidates: [pathOnly, named]) == [named.id, pathOnly.id])
    }

    @Test func fullyEqualScoresKeepTheListOrder() {
        let first = candidate("tool")
        let second = candidate("tool")
        #expect(SwitcherRanking.rank(query: "tool", candidates: [first, second]) == [first.id, second.id])
        #expect(SwitcherRanking.rank(query: "tool", candidates: [second, first]) == [second.id, first.id])
    }

    @Test func unicodeAndSpacesInQueriesAreHandled() {
        let item = candidate("Café Étoile", path: "/Users/me/étoile")
        #expect(SwitcherRanking.rank(query: "étoile", candidates: [item]) == [item.id])
        #expect(SwitcherRanking.rank(query: "café é", candidates: [item]) == [item.id])
    }
}
