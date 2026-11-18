import KitManagerCore
import SwiftUI

/// The files of a transition, most important first, with a kind symbol each. Long lists collapse
/// to `limit` rows behind a "Show all" button.
struct ChangeFileList: View {
    let changes: [FileChangeSummary]
    var limit = 8

    @State private var showAll = false

    private var sorted: [FileChangeSummary] {
        changes.sorted { lhs, rhs in
            lhs.kind.sortRank != rhs.kind.sortRank ? lhs.kind.sortRank < rhs.kind.sortRank : lhs.path < rhs.path
        }
    }

    var body: some View {
        let files = sorted
        let shown = showAll ? files : Array(files.prefix(limit))
        VStack(alignment: .leading, spacing: 3) {
            ForEach(shown, id: \.self) { change in
                HStack(spacing: 8) {
                    Text(change.kind.symbol)
                        .font(.callout.monospaced().weight(.bold))
                        .foregroundStyle(change.kind.color)
                        .frame(width: 14)
                        .accessibilityHidden(true)
                    Text(change.path)
                        .font(.caption.monospaced())
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .help(change.path)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(change.kind.title): \(change.path)")
            }
            if files.count > limit {
                Button(showAll ? "Show fewer" : "Show all \(files.count) files") { showAll.toggle() }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.amber)
                    .font(.caption)
                    .padding(.top, 2)
            }
        }
    }
}
