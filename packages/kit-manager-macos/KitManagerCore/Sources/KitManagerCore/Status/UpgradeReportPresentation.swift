import Foundation

public struct GroupedChangeCounts: Sendable, Equatable {
    public let appliedAutomatically: Int
    public let needsDecision: Int
    public let keptYourVersion: Int
    public let newFiles: Int

    public init(report: TransitionReport) {
        let counts = PreviewSummary(report: report).counts
        appliedAutomatically = counts[.update, default: 0] + counts[.merge, default: 0] + counts[.delete, default: 0]
        needsDecision = counts[.conflict, default: 0]
        keptYourVersion = counts[.keepEdited, default: 0]
        newFiles = counts[.create, default: 0]
    }
}

public struct UpgradeRiskSummary: Sendable, Equatable {
    public let total: Int
    public let risky: Int
    public let touched: Int
    public let untouched: Int
    public let title: String
    public let detail: String?

    public init?(_ unsaved: UnsavedWork?) {
        guard let unsaved, unsaved.total > 0 else { return nil }
        total = unsaved.total
        risky = unsaved.risky.count
        touched = unsaved.touched.count
        untouched = unsaved.untouched

        let files = total == 1 ? "1 file" : "\(total) files"
        let intro = "You have unsaved changes in \(files)."
        guard risky > 0 else {
            title = "\(intro) \(total == 1 ? "It isn't" : "None of them are") at risk."
            detail = nil
            return
        }
        title = "\(risky == 1 ? "1 file" : "\(risky) files") you're still working on can't be updated cleanly."
        let conflicts = unsaved.risky.count { $0.kind == .conflict }
        let kept = risky - conflicts
        var outcomes: [String] = []
        if conflicts > 0 {
            outcomes.append("\(conflicts) of these \(conflicts == 1 ? "conflicts" : "conflict") with the kit")
        }
        if kept > 0 {
            outcomes.append("\(kept)\(conflicts == 0 ? " of these" : "") will keep your version")
        }
        let safe = touched > 0 || untouched > 0 ? " The rest are safe." : ""
        detail = "\(intro) \(outcomes.joined(separator: " and ")).\(safe)"
    }
}

public struct MissingFeatureSummary: Sendable, Equatable {
    public let notes: [NoteReport]
    public let unnamedKeptFiles: Int

    public init(report: TransitionReport) {
        let allNotes = report.notes ?? []
        notes = allNotes.filter { $0.outcome == .kept || $0.outcome == .conflict }
        let covered = Set(allNotes.flatMap(\.files))
        unnamedKeptFiles = report.changes.count { $0.kind == .keepEdited && !covered.contains($0.path) }
    }

    public var unnamedKeptFilesLabel: String {
        "\(unnamedKeptFiles) more \(unnamedKeptFiles == 1 ? "file" : "files") kept without a named feature"
    }
}

extension TransitionReport {
    public var groupedCounts: GroupedChangeCounts { GroupedChangeCounts(report: self) }
    public var riskSummary: UpgradeRiskSummary? { UpgradeRiskSummary(unsaved) }
    public var missingFeatures: MissingFeatureSummary { MissingFeatureSummary(report: self) }
}

extension SavedReport {
    /// Resolutions for kept files don't reduce the number of unresolved conflicts.
    public var decisionsLeft: Int {
        Set(transition.conflicts).subtracting(resolutions.map(\.path)).count
    }

    public var decisionsLeftLabel: String {
        "\(decisionsLeft) \(decisionsLeft == 1 ? "decision" : "decisions") left"
    }
}

extension SuggestionAction {
    public var shortLabel: String {
        switch self {
        case .takeKit: "Suggest: take kit, re-apply yours"
        case .combine: "Suggest: combine"
        case .keepMine: "Suggest: keep yours"
        case .byHand: "Decide by hand"
        }
    }
}

extension Backup {
    public func expiryLabel(locale: Locale = .current, timeZone: TimeZone = .current) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.timeZone = timeZone
        formatter.setLocalizedDateFormatFromTemplate("dMMM")
        return "backup kept until \(formatter.string(from: expiresAt))"
    }
}

extension UndoBlocked {
    public var displayMessage: String {
        guard reason == .changes, !paths.isEmpty else { return message }
        let changes = paths.count == 1 ? "1 unsaved change" : "\(paths.count) unsaved changes"
        return "To restore the backup, first commit or discard your \(changes). Kit Manager won't throw away work you've done since the update."
    }
}
