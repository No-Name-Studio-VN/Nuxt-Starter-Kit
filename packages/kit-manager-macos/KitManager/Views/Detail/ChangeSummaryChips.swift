import KitManagerCore
import SwiftUI

/// One chip per change kind in a report: `+ 3 new`, `M 2 merged`, `! 1 conflict`.
struct ChangeSummaryChips: View {
    let changes: [FileChangeSummary]

    private var counts: [(kind: ChangeKind, count: Int)] {
        let grouped = Dictionary(grouping: changes, by: \.kind)
        return grouped.map { (kind: $0.key, count: $0.value.count) }.sorted { $0.kind.sortRank < $1.kind.sortRank }
    }

    var body: some View {
        if changes.isEmpty {
            Text("No file changes").font(.callout).foregroundStyle(.secondary)
        } else {
            HStack(spacing: 6) {
                ForEach(counts, id: \.kind) { entry in
                    HStack(spacing: 4) {
                        Text(entry.kind.symbol).font(.caption.monospaced().weight(.bold)).foregroundStyle(entry.kind.color)
                        Text("\(entry.count) \(entry.kind.title)").font(.caption.monospacedDigit())
                    }
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Theme.hairline.opacity(0.55), in: .rect(cornerRadius: 4))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(entry.count) \(entry.kind.title)")
                }
            }
        }
    }
}
