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
        .accessibilityLabel(count > 0 ? "Kit Manager, \(count) need attention" : "Kit Manager")
    }
}
