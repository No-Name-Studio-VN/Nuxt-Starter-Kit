import KitManagerCore
import SwiftUI

/// A compact project status for list rows.
struct StatusLabel: View {
    let status: ProjectStatus

    var body: some View {
        Label {
            Text(status.title)
                .foregroundStyle(.secondary)
        } icon: {
            if case .checking = status {
                ProgressView().controlSize(.mini)
            } else {
                Image(systemName: status.symbol)
                    .foregroundStyle(status.tone.color)
            }
        }
        .help(status.help)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(status.help)
    }
}
