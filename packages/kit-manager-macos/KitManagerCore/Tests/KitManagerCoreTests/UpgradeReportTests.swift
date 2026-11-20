import Foundation
import Testing

@testable import KitManagerCore

@Suite("Upgrade reports")
struct UpgradeReportTests {
    @Test func olderReportsStillDecodeWithoutSafetyFields() throws {
        let decoder = JSONDecoder()
        let transition = try decoder.decode(TransitionReport.self, from: fixture("transition"))
        let inspect = try decoder.decode(InspectReport.self, from: fixture("inspect"))
        #expect(transition.unsaved == nil)
        #expect(transition.backup == nil)
        #expect(transition.notes == nil)
        #expect(transition.suggestions == nil)
        #expect(transition.report == nil)
        #expect(inspect.features == nil)
    }

    @Test func inspectReadsMissingAndDeclinedFeatures() throws {
        let report = try JSONDecoder().decode(InspectReport.self, from: fixture("inspect-features"))
        #expect(report.features?.missing.first?.id == "auth.menu")
        #expect(report.features?.missing.first?.affected == ["header.ts"])
        #expect(report.features?.declined == ["base.declined"])
    }

    @Test func kitStateReadsDeclinedWhenPresent() throws {
        let decoder = JSONDecoder()
        let prefix = #"{"version":3,"kit":"kit","commit":"a","modules":[],"identity":{"name":"App","description":""},"conflicts":[]"#
        let old = try decoder.decode(KitState.self, from: Data((prefix + "}").utf8))
        let new = try decoder.decode(KitState.self, from: Data((prefix + #", "declined":["auth.menu"]}"#).utf8))
        #expect(old.declined == nil)
        #expect(new.declined == ["auth.menu"])
    }

    @Test func savedReportLoadsFromDiskAndIgnoresAbsentOrInvalidFiles() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        #expect(SavedReport.read(temp.url) == nil)
        try temp.write(".nuxt-saas/upgrade-report.json", "not JSON")
        #expect(SavedReport.read(temp.url) == nil)
        try temp.write(".nuxt-saas/upgrade-report.json", #"{"schema":2}"#)
        #expect(SavedReport.read(temp.url) == nil)
        try fixture("saved-report").write(to: temp.url.appending(path: ".nuxt-saas/upgrade-report.json"))
        let report = try #require(SavedReport.read(temp.url))
        #expect(report.command == .upgrade)
        #expect(report.fromVersion == nil)
        #expect(report.toVersion == "3.2.0")
        #expect(report.createdAt == Date(timeIntervalSince1970: 1_795_252_441))
        #expect(report.resolutions.first?.at == Date(timeIntervalSince1970: 1_795_252_501))
        let backup = try #require(report.transition.backup)
        #expect(abs(backup.createdAt.timeIntervalSince1970 - 1_795_252_440.123) < 0.001)
        #expect(backup.expiresAt == Date(timeIntervalSince1970: 1_796_462_040))
        #expect(try JSONDecoder().decode(SavedReport.self, from: JSONEncoder().encode(report)) == report)
    }

    @Test func groupedCountsExcludeNewAndProtectedFilesFromApplied() throws {
        let report = try JSONDecoder().decode(SavedReport.self, from: fixture("saved-report"))
        let counts = report.transition.groupedCounts
        #expect(counts.appliedAutomatically == 3)
        #expect(counts.needsDecision == 2)
        #expect(counts.keptYourVersion == 2)
        #expect(counts.newFiles == 1)
    }

    @Test func riskSummarySeparatesTouchedFromRiskyAndUntouched() throws {
        let report = try JSONDecoder().decode(SavedReport.self, from: fixture("saved-report"))
        let summary = try #require(report.transition.riskSummary)
        #expect(summary.risky == 2)
        #expect(summary.touched == 1)
        #expect(summary.untouched == 2)
        #expect(summary.title == "2 files you're still working on can't be updated cleanly.")
        #expect(summary.detail == "You have unsaved changes in 5 files. 1 of these conflicts with the kit and 1 will keep your version. The rest are safe.")
    }

    @Test func safeUnsavedWorkGetsReassuranceAndNoWarningForCleanTrees() throws {
        let decoder = JSONDecoder()
        let safe = try decoder.decode(UnsavedWork.self, from: Data(#"{"total":12,"risky":[],"touched":["ok.ts"],"untouched":11}"#.utf8))
        #expect(UpgradeRiskSummary(safe)?.title == "You have unsaved changes in 12 files. None of them are at risk.")
        let clean = try decoder.decode(UnsavedWork.self, from: Data(#"{"total":0,"risky":[],"touched":[],"untouched":0}"#.utf8))
        #expect(UpgradeRiskSummary(clean) == nil)
        #expect(UpgradeRiskSummary(nil) == nil)
    }

    @Test func resolvingAKeptFileDoesNotReduceTheConflictCount() throws {
        let report = try JSONDecoder().decode(SavedReport.self, from: fixture("saved-report"))
        #expect(report.decisionsLeft == 1)
        #expect(report.decisionsLeftLabel == "1 decision left")
    }

    @Test func missingFeatureSummaryShowsKeptAndConflictNotesAndUncoveredFiles() throws {
        let report = try JSONDecoder().decode(SavedReport.self, from: fixture("saved-report"))
        let missing = report.transition.missingFeatures
        #expect(missing.notes.map(\.id) == ["auth.session", "auth.menu"])
        #expect(missing.unnamedKeptFiles == 1)
        #expect(missing.unnamedKeptFilesLabel == "1 more file kept without a named feature")
    }

    @Test func suggestionsUseTheApprovedShortLabels() {
        #expect(SuggestionAction.takeKit.shortLabel == "Suggest: take kit, re-apply yours")
        #expect(SuggestionAction.combine.shortLabel == "Suggest: combine")
        #expect(SuggestionAction.keepMine.shortLabel == "Suggest: keep yours")
        #expect(SuggestionAction.byHand.shortLabel == "Decide by hand")
    }

    @Test func backupExpiryUsesDayAndMonth() throws {
        let report = try JSONDecoder().decode(SavedReport.self, from: fixture("saved-report"))
        let utc = try #require(TimeZone(secondsFromGMT: 0))
        #expect(report.transition.backup?.expiryLabel(locale: Locale(identifier: "en_GB"), timeZone: utc) == "backup kept until 5 Dec")
    }

    @Test func undoBlockShowsAnAppMessageForChangesAndTheCLIMessageOtherwise() throws {
        let decoder = JSONDecoder()
        let changes = try decoder.decode(UndoReport.self, from: fixture("undo-report"))
        #expect(changes.blocked?.displayMessage == "To restore the backup, first commit or discard your 2 unsaved changes. Kit Manager won't throw away work you've done since the update.")
        let moved = try decoder.decode(UndoBlocked.self, from: Data(#"{"reason":"moved-head","message":"You've committed or switched commits since the upgrade.","paths":[]}"#.utf8))
        #expect(moved.displayMessage == "You've committed or switched commits since the upgrade.")
    }
}
