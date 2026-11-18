import KitManagerCore
import SwiftUI

/// What a transition report changes: chips per kind, the first files, the conflicts and the follow-ups.
struct TransitionReportSummary: View {
    let report: TransitionReport
    var fileLimit = 6

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ChangeSummaryChips(changes: report.changes)
            ChangeFileList(changes: report.changes, limit: fileLimit)
            if !report.conflicts.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Label(
                        "\(report.conflicts.count) conflict\(report.conflicts.count == 1 ? "" : "s")",
                        systemImage: "exclamationmark.triangle.fill"
                    )
                    .font(.callout.weight(.medium))
                    .foregroundStyle(Theme.red)
                    ForEach(report.conflicts, id: \.self) { path in
                        Text(path).font(.caption.monospaced()).lineLimit(1).truncationMode(.middle)
                    }
                }
            }
            if !report.followUps.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Follow-ups").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    ForEach(report.followUps, id: \.self) { Text($0).font(.callout) }
                }
            }
        }
    }
}
