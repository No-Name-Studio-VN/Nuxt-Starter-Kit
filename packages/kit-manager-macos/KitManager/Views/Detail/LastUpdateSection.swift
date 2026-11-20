import KitManagerCore
import SwiftUI

struct LastUpdateSection: View {
    let project: Project
    let snapshot: ProjectSnapshot
    let report: SavedReport
    let onPresent: (UpdateReportSheet) -> Void

    @Environment(AppModel.self) private var model

    private var transition: TransitionReport { report.transition }
    private var counts: GroupedChangeCounts { transition.groupedCounts }
    private var cliReady: Bool { model.cliStatus == .ready }
    private var resolutions: [String: ResolutionAction] {
        Dictionary(report.resolutions.map { ($0.path, $0.action) }, uniquingKeysWith: { _, latest in latest })
    }

    private var conflicts: [String] {
        let paths = transition.conflicts.filter { resolutions[$0] == nil }
        guard case .loaded(let inspect, false) = snapshot.inspect else { return paths }
        let unresolved = Set(inspect.conflicts.unresolved)
        return paths.filter(unresolved.contains)
    }

    private var suggestions: [String: Suggestion] {
        Dictionary((transition.suggestions ?? []).map { ($0.path, $0) }, uniquingKeysWith: { first, _ in first })
    }

    private var declined: [String] {
        snapshot.kitState?.declined ?? snapshot.inspect.value?.features?.declined ?? []
    }

    private var featureTitles: [String: String] {
        let notes = (transition.notes ?? []) + (snapshot.inspect.value?.features?.missing ?? [])
        let catalogue = model.catalogue.flatMap { $0.changes ?? [] }
        return Dictionary(notes.map { ($0.id, $0.title) } + catalogue.map { ($0.id, $0.title) },
            uniquingKeysWith: { first, _ in first })
    }

    private var missingNotes: [NoteReport] {
        transition.missingFeatures.notes.filter { note in
            !declined.contains(note.id) && !missingPaths(for: note).isEmpty
        }
    }

    private func missingPaths(for note: NoteReport) -> [String] {
        note.affected.filter { path in
            switch resolutions[path] {
            case .takeKit, .combine: false
            case .keepMine: true
            case nil: conflicts.contains(path) || transition.changes.contains { $0.path == path && $0.kind == .keepEdited }
            }
        }
    }

    private var unnamedKeptPaths: [String] {
        let named = Set((transition.notes ?? []).flatMap(\.files))
        return transition.changes.compactMap { change in
            guard change.kind == .keepEdited, !named.contains(change.path), resolutions[change.path] != .takeKit else { return nil }
            return change.path
        }
    }

    var body: some View {
        Section("Last Update") {
            RestoreBackupRows(project: project, report: report)
            stats
        }
        if !missingNotes.isEmpty || !unnamedKeptPaths.isEmpty {
            Section("You May Be Missing") {
                ForEach(missingNotes) { note in missingFeature(note) }
                if !unnamedKeptPaths.isEmpty { unnamedKeptFiles }
            }
        }
        if !conflicts.isEmpty {
            Section("Needs Your Decision · \(conflicts.count)") {
                ForEach(conflicts.prefix(4), id: \.self) { path in decisionRow(path) }
                HStack {
                    if conflicts.count > 4 { Text("\(conflicts.count - 4) more").foregroundStyle(.secondary) }
                    Spacer(minLength: 8)
                    Button("Walk Through Decisions") { onPresent(.walkthrough(path: nil)) }
                        .buttonStyle(.glassProminent)
                        .disabled(!cliReady)
                }
            }
        }
        if !declined.isEmpty {
            Section { declinedRow }
        }
    }

    private var stats: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) { statTiles }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 2), spacing: 8) { statTiles }
        }
    }

    @ViewBuilder
    private var statTiles: some View {
        stat("Applied automatically", count: counts.appliedAutomatically, symbol: "checkmark.circle.fill", color: .green)
        stat("Need your decision", count: conflicts.count, symbol: "exclamationmark.triangle.fill", color: .orange)
        stat("Kept your version", count: counts.keptYourVersion, symbol: "arrow.uturn.backward", color: .purple)
        stat("New files", count: counts.newFiles, symbol: "plus.circle.fill", color: .accentColor)
    }

    private func stat(_ title: String, count: Int, symbol: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 7) {
                Image(systemName: symbol).foregroundStyle(color).accessibilityHidden(true)
                Text(count.formatted()).font(.title3.weight(.semibold)).monospacedDigit()
            }
            Text(title).font(.caption).foregroundStyle(.secondary)
        }
        .padding(9)
        .frame(minWidth: 108, maxWidth: .infinity, alignment: .leading)
        .background(.fill.quaternary, in: .rect(cornerRadius: 8))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title): \(count)")
    }

    private func missingFeature(_ note: NoteReport) -> some View {
        let paths = missingPaths(for: note)
        let pendingConflicts = paths.filter(conflicts.contains)
        let pending = pendingConflicts.first ?? paths.first { resolutions[$0] == nil }
        let hasConflict = !pendingConflicts.isEmpty
        return HStack(alignment: .top, spacing: 10) {
            SettingsIcon(symbol: hasConflict ? "exclamationmark.triangle.fill" : "arrow.uturn.backward",
                color: note.kind == .security ? .red : hasConflict ? .orange : .purple, size: 24)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(note.title).fontWeight(.medium)
                Text(missingDetail(kept: paths.filter { !pendingConflicts.contains($0) }, conflicts: pendingConflicts))
                    .font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 6) {
                    if let module = model.catalogue.first(where: { $0.id == note.module }) {
                        Text(module.title).font(.caption).foregroundStyle(.secondary)
                    }
                    ToneBadge(title: note.kind.displayTitle, tone: note.kind.tone, symbol: note.kind.symbol)
                }
            }
            .accessibilityElement(children: .combine)
            Spacer(minLength: 0)
            if let pending {
                Button("Review") { onPresent(.walkthrough(path: pending)) }
                    .buttonStyle(.glass)
                    .disabled(!cliReady)
                    .accessibilityLabel("Review \(note.title)")
            }
        }
    }

    private func missingDetail(kept: [String], conflicts: [String]) -> String {
        var details: [String] = []
        if !kept.isEmpty {
            let files = kept.joined(separator: ", ")
            details.append(kept.count == 1
                ? "Your copy of \(files) was kept because you'd changed it."
                : "Your copies of \(files) were kept because you'd changed them.")
        }
        if !conflicts.isEmpty {
            let files = conflicts.joined(separator: ", ")
            details.append(conflicts.count == 1 ? "\(files) has a conflict." : "These files have conflicts: \(files).")
            if conflicts.contains(where: { suggestions[$0]?.action == .takeKit }) {
                details.append("Taking the kit version is suggested.")
            }
        }
        return details.joined(separator: " ")
    }

    private var unnamedKeptFiles: some View {
        let count = unnamedKeptPaths.count
        return DisclosureGroup("\(count) more \(count == 1 ? "file" : "files") kept without a named feature") {
            ForEach(unnamedKeptPaths, id: \.self) { path in
                HStack {
                    Text(path).font(.caption.monospaced()).textSelection(.enabled)
                    Spacer(minLength: 8)
                    if resolutions[path] == nil {
                        Button("Review") { onPresent(.walkthrough(path: path)) }
                            .buttonStyle(.glass)
                            .disabled(!cliReady)
                            .accessibilityLabel("Review \(path)")
                    }
                }
            }
        }
    }

    private func decisionRow(_ path: String) -> some View {
        let suggestion = suggestions[path]
        let action = suggestion?.action ?? .byHand
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) {
                decisionText(path, reason: suggestion?.reason)
                    .fixedSize(horizontal: true, vertical: false)
                Spacer(minLength: 0)
                ToneBadge(title: action.shortLabel, tone: action.tone, symbol: action.symbol)
            }
            VStack(alignment: .leading, spacing: 5) {
                decisionText(path, reason: suggestion?.reason)
                ToneBadge(title: action.shortLabel, tone: action.tone, symbol: action.symbol)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func decisionText(_ path: String, reason: String?) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(path).font(.callout.monospaced()).textSelection(.enabled)
            if let reason { Text(reason).font(.caption).foregroundStyle(.secondary) }
        }
    }

    private var declinedRow: some View {
        HStack(spacing: 12) {
            Text("Features you said no to: \(declined.map { featureTitles[$0] ?? $0 }.joined(separator: ", ")). These won't come up in future updates.")
                .font(.callout).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button("Manage") { onPresent(.declined(ids: declined, titles: featureTitles)) }
                .buttonStyle(.glass)
                .fixedSize()
                .accessibilityLabel("Manage declined features")
        }
    }

}

enum UpdateReportSheet: Identifiable {
    case walkthrough(path: String?)
    case declined(ids: [String], titles: [String: String])

    var id: String {
        switch self {
        case .walkthrough(let path): "walkthrough:\(path ?? "")"
        case .declined: "declined"
        }
    }
}
