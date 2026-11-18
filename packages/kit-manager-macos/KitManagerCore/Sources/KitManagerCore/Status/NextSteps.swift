import Foundation

public enum NextSteps {
    /// Picks the highest-priority action per project, grouping migrations under the first eligible
    /// project. Equal priorities keep the given order.
    public static func suggest(_ projects: [(id: UUID, snapshot: ProjectSnapshot)], limit: Int = 3) -> [NextStep] {
        guard limit > 0 else { return [] }

        var steps: [NextStep] = []
        var firstMigration: UUID?
        var otherMigrations = 0

        for (id, snapshot) in projects {
            let kind: NextStep.Kind
            switch ProjectStatus(snapshot: snapshot) {
            case .unresolvedConflicts(let count):
                kind = .fixConflicts(count)
            case .behind:
                kind = .update
            case .needsMigration(let source) where source != .other:
                if firstMigration == nil {
                    firstMigration = id
                } else {
                    otherMigrations += 1
                }
                continue
            default:
                if let missing = snapshot.env?.missing.count, missing > 0 {
                    kind = .missingEnvKeys(missing)
                } else if snapshot.health?.isUp == false {
                    kind = .siteDown
                } else {
                    continue
                }
            }
            steps.append(NextStep(projectID: id, kind: kind))
        }

        if let firstMigration {
            steps.append(NextStep(projectID: firstMigration, kind: .migrate(others: otherMigrations)))
        }

        // Swift's sort is stable, so no other tie-breaker is needed.
        return Array(steps.sorted { priority(of: $0.kind) < priority(of: $1.kind) }.prefix(limit))
    }

    private static func priority(of kind: NextStep.Kind) -> Int {
        switch kind {
        case .fixConflicts: 0
        case .update: 1
        case .migrate: 2
        case .missingEnvKeys: 3
        case .siteDown: 4
        }
    }
}
