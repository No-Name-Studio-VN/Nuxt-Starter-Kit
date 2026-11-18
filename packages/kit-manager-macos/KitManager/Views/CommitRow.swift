import KitManagerCore
import SwiftUI

/// One kit commit: `type(scope)`, the title, optionally the modules it touched, and its age.
struct CommitRow: View {
    let commit: KitCommit
    var showsModules = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            if let type = commit.type {
                Text(commit.scope.map { "\(type)(\($0))" } ?? type)
                    .font(.caption.monospaced())
                    .foregroundStyle(commit.breaking ? Theme.red : Color.secondary)
                    .lineLimit(1)
                    .frame(minWidth: 52, alignment: .leading)
            }
            Text(commit.title)
                .font(.callout)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            if showsModules, !commit.modules.isEmpty {
                ModuleChips(modules: ChangelogGrouper.ordered(Array(commit.modules)), limit: 2)
                    .frame(width: 130, alignment: .trailing)
            }
            Text(commit.date.formatted(.relative(presentation: .named)))
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                // A fixed column when the chips are shown, so every row lines up.
                .frame(width: showsModules ? 84 : nil, alignment: .trailing)
        }
        .accessibilityElement(children: .combine)
    }
}
