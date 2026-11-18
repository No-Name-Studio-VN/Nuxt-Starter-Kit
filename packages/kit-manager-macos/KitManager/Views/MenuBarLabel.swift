import SwiftUI

/// The menu bar symbol, with the number of projects that need attention beside it when there are any.
struct MenuBarLabel: View {
    let count: Int

    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: "square.stack.3d.up")
            if count > 0 {
                Text("\(count)").monospacedDigit()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(count > 0 ? "Kit Manager, \(Self.attentionSummary(count))" : "Kit Manager")
    }

    static func attentionSummary(_ count: Int) -> String {
        switch count {
        case 0: "All projects are up to date"
        case 1: "1 project needs attention"
        default: "\(count) projects need attention"
        }
    }
}
