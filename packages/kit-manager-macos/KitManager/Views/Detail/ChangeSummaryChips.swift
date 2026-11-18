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
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 6) { chips }
                    .fixedSize()
                VStack(alignment: .leading, spacing: 4) { chips }
            }
        }
    }

    private var chips: some View {
        ForEach(counts, id: \.kind) { entry in
            HStack(spacing: 4) {
                Text(entry.kind.symbol).font(.caption.monospaced().weight(.bold)).foregroundStyle(entry.kind.color)
                Text("\(entry.count) \(entry.kind.title)").font(.caption.monospacedDigit())
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(.fill.quaternary, in: .capsule)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(entry.count) \(entry.kind.title)")
        }
    }
}
