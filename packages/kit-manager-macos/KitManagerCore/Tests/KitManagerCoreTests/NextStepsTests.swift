import Foundation
import Testing

@testable import KitManagerCore

private let defaultKit = "github:No-Name-Studio-VN/Nuxt-Starter-Kit"

/// A kit v3 project on the default template, already checked against main.
private func project(
    behind: Int = 0, conflicts: [String] = [], env: EnvCheck? = nil, health: SiteHealth? = nil
) -> ProjectSnapshot {
    let state = KitState(
        version: 3, kit: defaultKit, commit: String(repeating: "a", count: 40), modules: [],
        identity: KitIdentity(name: "Acme", description: "Acme app"), conflicts: conflicts)
    return ProjectSnapshot(kind: .kitV3(state), env: env, health: health, availability: .onMain, behind: behind)
}

@Suite("Next steps")
struct NextStepsTests {
    @Test func statusFiltersMatchTheirCases() {
        let filters = StatusFilter.allCases
        #expect(filters.filter { $0.matches(.upToDate) } == [.upToDate])
        #expect(filters.filter { $0.matches(.behind(2, .pending)) } == [.updates])
        #expect(filters.filter { $0.matches(.needsMigration(.nuxt)) } == [.notOnKit])
        #expect(filters.filter { $0.matches(.needsMigration(.legacy)) } == [.notOnKit])
        #expect(filters.filter { $0.matches(.needsMigration(.other)) }.isEmpty)
    }

    @Test func conflictsComeFirst() {
        let a = UUID()
        let b = UUID()
        let steps = NextSteps.suggest([(a, project(behind: 2)), (b, project(conflicts: ["a", "b"]))])
        #expect(steps == [NextStep(projectID: b, kind: .fixConflicts(2)), NextStep(projectID: a, kind: .update)])
    }

    @Test func oneStepPerProject() {
        let id = UUID()
        let snapshot = project(conflicts: ["a"], env: EnvCheck(hasExample: true, hasEnv: true, missing: ["A"]))
        #expect(NextSteps.suggest([(id, snapshot)]) == [NextStep(projectID: id, kind: .fixConflicts(1))])
    }

    @Test func migrationCollapsesIntoOneStep() {
        let first = UUID()
        let nuxt = ProjectSnapshot(kind: .nuxt)
        let steps = NextSteps.suggest([(first, nuxt), (UUID(), nuxt), (UUID(), nuxt), (UUID(), nuxt)])
        #expect(steps == [NextStep(projectID: first, kind: .migrate(others: 3))])
    }

    @Test func limitIsRespected() {
        let down = UUID()
        let env = UUID()
        let migration = UUID()
        let update = UUID()
        let conflicts = UUID()
        let offline = SiteHealth(statusCode: 503, latency: .milliseconds(80), error: nil)
        let missing = EnvCheck(hasExample: true, hasEnv: true, missing: ["A", "B"])
        let projects = [
            (down, ProjectSnapshot(kind: .other, health: offline)),
            (env, project(env: missing, health: offline)),
            (migration, ProjectSnapshot(kind: .kitLegacy)),
            (update, project(behind: 2)),
            (conflicts, project(conflicts: ["a"])),
        ]
        let expected = [
            NextStep(projectID: conflicts, kind: .fixConflicts(1)),
            NextStep(projectID: update, kind: .update),
            NextStep(projectID: migration, kind: .migrate(others: 0)),
            NextStep(projectID: env, kind: .missingEnvKeys(2)),
            NextStep(projectID: down, kind: .siteDown),
        ]
        #expect(NextSteps.suggest(projects) == Array(expected.prefix(3)))
        #expect(NextSteps.suggest(projects, limit: 5) == expected)
        #expect(NextSteps.suggest(projects, limit: 0).isEmpty)
        #expect(NextSteps.suggest(projects, limit: -1).isEmpty)
    }

    @Test func tiesKeepInputOrder() {
        let first = UUID()
        let second = UUID()
        let a = project(behind: 2)
        let b = project(behind: 5)
        #expect(NextSteps.suggest([(first, a), (second, b)]).map(\.id) == [first, second])
        #expect(NextSteps.suggest([(second, b), (first, a)]).map(\.id) == [second, first])
    }

    @Test func healthyProjectsYieldNothing() {
        let healthy = project(
            env: EnvCheck(hasExample: true, hasEnv: true, missing: []),
            health: SiteHealth(statusCode: 200, latency: .milliseconds(80), error: nil))
        #expect(NextSteps.suggest([(UUID(), healthy)]).isEmpty)
    }
}
