import KitManagerCore

/// Presentation shared by project status labels and pills.
extension ProjectStatus {
    var title: String {
        switch self {
        case .upToDate: "Up to date"
        case .behind: "Update available"
        case .unresolvedConflicts(let count): count == 1 ? "1 conflict to fix" : "\(count) conflicts to fix"
        case .needsMigration(.legacy), .needsMigration(.nuxt): "Not on the kit yet"
        case .needsMigration(.other): "Not a Nuxt project"
        case .kitSource: "The kit itself"
        case .pinned(let ref): "Locked to \(ref)"
        case .otherTemplate: "Made from another template"
        case .commitNotOnMain: "Kit version not found"
        case .checkFailed: "Couldn't check"
        case .kitUnavailable: "Can't reach the kit"
        case .missing: "Folder missing"
        case .invalid: "Kit settings unreadable"
        case .checking: "Checking…"
        }
    }

    var detail: String? {
        switch self {
        case .upToDate: "Latest kit"
        case .behind(let count, _): changesSinceYourVersion(count)
        case .unresolvedConflicts: "Left over from the last update"
        case .needsMigration(.legacy): "Made with kit 2.x"
        case .needsMigration(.nuxt): "Plain Nuxt app"
        case .kitSource: "Your kit checkout"
        case .pinned: "Won't follow new releases"
        case .otherTemplate: "No version to compare"
        case .commitNotOnMain(let sha): sha
        case .needsMigration(.other), .checkFailed, .kitUnavailable, .missing, .invalid, .checking: nil
        }
    }

    var symbol: String {
        switch self {
        case .upToDate: "checkmark.circle.fill"
        case .behind: "arrow.down.circle.fill"
        case .unresolvedConflicts, .kitUnavailable: "exclamationmark.triangle.fill"
        case .needsMigration(.legacy), .needsMigration(.nuxt): "arrow.triangle.merge"
        case .needsMigration(.other): "minus.circle"
        case .kitSource: "shippingbox.fill"
        case .pinned: "lock.fill"
        case .otherTemplate: "square.on.square"
        case .commitNotOnMain: "questionmark.circle"
        case .checkFailed: "exclamationmark.circle"
        case .missing: "questionmark.folder"
        case .invalid: "xmark.octagon"
        case .checking: "clock"
        }
    }

    var tone: StatusTone {
        switch self {
        case .upToDate: .positive
        case .behind: .accent
        case .unresolvedConflicts, .missing, .invalid: .critical
        case .needsMigration(.legacy), .needsMigration(.nuxt): .warning
        case .needsMigration(.other), .kitSource, .pinned, .otherTemplate, .commitNotOnMain,
            .checkFailed, .kitUnavailable, .checking: .neutral
        }
    }

    var help: String {
        switch self {
        case .upToDate: "Up to date with the latest kit"
        case .behind(let count, let preview): "\(title): \(changesSinceYourVersion(count)). \(help(for: preview))"
        case .unresolvedConflicts: "\(title): left over from the last update"
        case .needsMigration(.legacy): "\(title): made with create-nuxt-saas 2.x"
        case .needsMigration(.nuxt): "\(title): a Nuxt project that does not use the kit"
        case .needsMigration(.other): title
        case .kitSource: "\(title): this is your kit checkout, so there is nothing to migrate or update"
        case .pinned: "\(title): updates follow this version instead of new releases"
        case .otherTemplate: "\(title): made from a fork or another version, so there is no version to compare"
        case .commitNotOnMain(let sha): "\(title): kit commit \(sha) is not on main in your kit checkout"
        case .checkFailed(let message): "\(title) against the latest kit: \(message)"
        case .kitUnavailable(let reason): "\(title) to check for updates: \(reason)"
        case .missing: "\(title): the folder was moved or deleted"
        case .invalid(let reason): "\(title): \(reason)"
        case .checking: "Checking status"
        }
    }

    private func changesSinceYourVersion(_ count: Int) -> String {
        count == 1 ? "1 change since your version" : "\(count) changes since your version"
    }

    private func help(for preview: UpgradePreview) -> String {
        switch preview {
        case .pending: "The update preview is being prepared."
        case .ready(let summary, let stale):
            "Update: \(upgradeCost(summary))\(stale ? ". This preview is out of date and is being recomputed." : ".")"
        case .failed(let message): "The update preview failed: \(message)"
        }
    }

    /// "clean", "3 merges" or "2 conflicts".
    private func upgradeCost(_ summary: PreviewSummary) -> String {
        if summary.conflicts > 0 { return summary.conflicts == 1 ? "1 conflict" : "\(summary.conflicts) conflicts" }
        let merges = summary.counts[.merge, default: 0]
        if merges > 0 { return merges == 1 ? "1 merge" : "\(merges) merges" }
        return "clean"
    }
}
