import KitManagerCore
import SwiftUI

/// A coloured capsule showing the project's status.
struct StatusPill: View {
    let status: ProjectStatus

    var body: some View {
        let tone = status.tone
        HStack(spacing: 5) {
            Image(systemName: status.symbol)
            Text(status.title)
        }
        .font(.callout.weight(.medium))
        .lineLimit(1)
        .foregroundStyle(tone.color)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background((tone == .neutral ? Color.gray : tone.color).opacity(0.14), in: .capsule)
        .help(status.help)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(status.help)
    }
}
