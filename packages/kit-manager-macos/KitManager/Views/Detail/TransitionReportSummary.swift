import KitManagerCore
import SwiftUI

/// What a transition report changes: chips per kind, the first files, the conflicts and the follow-ups.
struct TransitionReportSummary: View {
    let report: TransitionReport
    var modules: Set<String>? = nil
    var fileLimit = 6

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ChangeFileList(report: report, modules: modules, limit: fileLimit)
            if !report.conflicts.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Label(
                        ProjectStatus.unresolvedConflicts(report.conflicts.count).title,
                        systemImage: "exclamationmark.triangle.fill"
                    )
                    .font(.callout.weight(.medium))
                    .foregroundStyle(Color.red)
                    ForEach(report.conflicts, id: \.self) { path in
                        Text(path).font(.caption.monospaced()).lineLimit(1).truncationMode(.middle)
                    }
                }
            }
            if !report.followUps.isEmpty {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Follow-ups").font(.subheadline.weight(.semibold))
                    ForEach(report.followUps, id: \.self) {
                        Text($0).font(.callout).foregroundStyle(.secondary)
                    }
                }
            }
        }
    }
}
