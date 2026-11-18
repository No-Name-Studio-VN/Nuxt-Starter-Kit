import Foundation
import KitManagerCore

/// A table row: a stored project joined with its latest snapshot. Sort keys live here so the
/// `Table` can sort with key paths.
struct ProjectRow: Identifiable {
    let project: Project
    let snapshot: ProjectSnapshot?

    var id: UUID { project.id }

    var folderName: String { project.url.lastPathComponent }

    var name: String {
        if let override = project.displayName, !override.isEmpty { return override }
        return snapshot?.kitState?.identity.name ?? folderName
    }

    /// The path with the home folder shortened to `~`.
    var displayPath: String {
        (project.path as NSString).abbreviatingWithTildeInPath
    }

    var status: ProjectStatus {
        snapshot.map(ProjectStatus.init(snapshot:)) ?? .checking
    }

    var isMissing: Bool {
        if case .missing = snapshot?.kind { return true }
        return false
    }

    var attention: Set<AttentionReason> {
        snapshot.map(AttentionReason.reasons(for:)) ?? []
    }

    var modules: [String] {
        snapshot?.kitState?.modules ?? []
    }

    var isKitProject: Bool {
        snapshot?.kitState != nil
    }

    /// `v3.0.1 +4`, the short commit when there is no label, `2.x` for legacy projects, `—` otherwise.
    var kitLabel: String {
        guard let snapshot else { return "—" }
        switch snapshot.kind {
        case .kitV3(let state): return snapshot.versionLabel ?? String(state.commit.prefix(7))
        case .kitLegacy: return "2.x"
        case .nuxt, .other, .missing, .invalidState: return "—"
        }
    }

    var kitIsCommit: Bool {
        guard let snapshot, snapshot.kitState != nil else { return false }
        return snapshot.versionLabel == nil
    }

    // MARK: Sort keys

    /// Orders by how much the project needs doing, worst first when sorted descending.
    var statusRank: Int {
        switch status {
        case .missing: 9
        case .invalid: 8
        case .unresolvedConflicts: 7
        case .behind: 6
        case .needsMigration: 4
        case .checkFailed: 3
        case .commitNotOnMain: 3
        case .otherTemplate: 2
        case .checking: 1
        case .upToDate: 0
        }
    }

    var gitSortKey: String {
        snapshot?.git?.branch ?? ""
    }

    var kitSortKey: String {
        kitLabel
    }
}
