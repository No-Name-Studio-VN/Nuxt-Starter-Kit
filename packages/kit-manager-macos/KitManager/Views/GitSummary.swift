import KitManagerCore
import SwiftUI

/// Branch, a dirty dot and ahead/behind arrows.
struct GitSummary: View {
    let git: GitStatus?

    var body: some View {
        if let git {
            HStack(spacing: 6) {
                Text(git.branch ?? "detached")
                    .font(.callout.monospaced())
                    .lineLimit(1)
                    .truncationMode(.middle)
                if git.dirtyCount > 0 {
                    Circle().fill(Theme.amber).frame(width: 7, height: 7)
                }
                if let ahead = git.ahead, ahead > 0 {
                    Text("↑\(ahead)").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                }
                if let behind = git.behind, behind > 0 {
                    Text("↓\(behind)").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                }
            }
            .help(helpText(git))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(helpText(git))
        } else {
            Text("—").foregroundStyle(.secondary)
                .accessibilityLabel("No git repository")
        }
    }

    private func helpText(_ git: GitStatus) -> String {
        var parts = ["Branch \(git.branch ?? "detached")"]
        if git.dirtyCount > 0 { parts.append("\(git.dirtyCount) uncommitted changes") }
        if let ahead = git.ahead, ahead > 0 { parts.append("\(ahead) ahead") }
        if let behind = git.behind, behind > 0 { parts.append("\(behind) behind") }
        return parts.joined(separator: ", ")
    }
}
