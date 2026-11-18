import Foundation
import Testing

@testable import KitManagerCore

private func commit(_ id: String, _ modules: Set<String>) -> KitCommit {
    KitCommit(
        id: id, subject: "feat: \(id)", type: "feat", scope: nil, breaking: false,
        date: Date(timeIntervalSince1970: 0), modules: modules)
}

private func file(_ path: String, _ status: InspectStatus, layer: String = "base", expected: Bool = false) -> InspectFile {
    InspectFile(path: path, status: status, layer: layer, expected: expected)
}

private func report(_ files: [InspectFile]) -> InspectReport {
    InspectReport(
        schema: 1, commit: "c", kit: "k", modules: [], identity: KitIdentity(name: "A", description: ""),
        conflicts: InspectConflicts(recorded: [], unresolved: []), files: files,
        summary: InspectSummary(
            total: files.count, unchanged: 0, edited: 0, deleted: 0, protected: 0, expected: 0, scored: 0,
            scoredChanged: 0))
}

@Suite("Detail page logic")
struct DetailLogicTests {
    @Test func changelogShowsBaseThenInstalledModulesOnly() {
        let commits = [
            commit("a", ["auth"]), commit("b", ["base"]), commit("c", ["blog"]), commit("d", ["auth", "base"]),
            commit("e", []),
        ]
        let groups = ChangelogGrouper.groups(commits: commits, installed: ["auth", "pwa"], showAll: false)
        #expect(groups.map(\.module) == ["base", "auth"])
        #expect(groups[0].commits.map(\.id) == ["b", "d"])
        // A commit that touched two relevant modules appears under both.
        #expect(groups[1].commits.map(\.id) == ["a", "d"])
    }

    @Test func showAllAddsOtherModulesAndUnshippedCommits() {
        let commits = [commit("a", ["blog"]), commit("b", ["auth"]), commit("c", []), commit("d", ["analytics"])]
        let groups = ChangelogGrouper.groups(commits: commits, installed: ["auth"], showAll: true)
        #expect(groups.map(\.module) == ["auth", "analytics", "blog", nil])
        #expect(groups.last?.commits.map(\.id) == ["c"])
    }

    @Test func commitTitleDropsTheConventionalPrefix() {
        func titled(_ subject: String) -> String {
            let parsed = KitRepository.parseConventional(subject)
            return KitCommit(
                id: "a", subject: subject, type: parsed.type, scope: parsed.scope, breaking: parsed.breaking,
                date: Date(timeIntervalSince1970: 0), modules: []
            ).title
        }
        #expect(titled("feat(auth): add passkeys: faster") == "add passkeys: faster")
        #expect(titled("fix!: drop v2 route") == "drop v2 route")
        #expect(titled("Merge branch 'main': tidy") == "Merge branch 'main': tidy")
        #expect(titled("chore: ") == "chore: ")
    }

    @Test func changelogWithNothingRelevantHasNoGroups() {
        #expect(ChangelogGrouper.groups(commits: [commit("a", ["blog"])], installed: [], showAll: false).isEmpty)
        #expect(ChangelogGrouper.groups(commits: [], installed: [], showAll: true).isEmpty)
    }

    @Test func layerBreakdownCountsOnlyScoredFiles() {
        let inspect = report([
            file("a", .unchanged), file("b", .edited), file("c", .deleted),
            file("layers/auth/a", .edited, layer: "auth"), file("layers/auth/b", .unchanged, layer: "auth"),
            file("package.json", .edited, expected: true), file(".gitignore", .protected),
            file("layers/zeta/x", .unchanged, layer: "zeta"),
        ])
        let layers = Customisation.layers(of: inspect)
        #expect(layers.map(\.layer) == ["base", "auth", "zeta"])
        #expect(layers[0] == LayerCustomisation(layer: "base", scored: 3, edited: 1, deleted: 1))
        #expect(layers[0].score == 2.0 / 3.0)
        #expect(layers[1].changed == 1)
        #expect(layers[2].score == 0)
    }

    @Test func layerBreakdownSkipsLayersWithNothingScored() {
        let inspect = report([file("package.json", .edited, expected: true), file(".gitignore", .protected)])
        #expect(Customisation.layers(of: inspect).isEmpty)
    }

    @Test func changedFilesSortByPathAndHideExpectedEdits() {
        let inspect = report([
            file("z.ts", .edited), file("a.ts", .deleted), file("m.ts", .unchanged),
            file("package.json", .edited, expected: true), file(".gitignore", .protected),
        ])
        #expect(Customisation.changedFiles(of: inspect).map(\.path) == ["a.ts", "z.ts"])
        #expect(
            Customisation.changedFiles(of: inspect, includeExpected: true).map(\.path)
                == ["a.ts", "package.json", "z.ts"])
    }
}
