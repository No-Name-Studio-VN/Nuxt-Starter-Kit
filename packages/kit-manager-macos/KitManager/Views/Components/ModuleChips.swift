import SwiftUI

/// A compact preview of affected modules, with the remaining IDs in the overflow chip's help.
struct ModuleChips: View {
    let modules: [String]

    private static let visibleCount = 3

    var body: some View {
        let hidden = modules.dropFirst(Self.visibleCount)
        HStack(spacing: 4) {
            ForEach(modules.prefix(Self.visibleCount), id: \.self) { module in
                chip(module, color: ModuleAppearance.color(for: module))
                    .help(module)
            }
            if !hidden.isEmpty {
                chip("+\(hidden.count)", color: .secondary)
                    .fixedSize()
                    .help(hidden.joined(separator: ", "))
            }
        }
        .accessibilityHidden(true) // The parent row speaks the full list.
    }

    private func chip(_ label: String, color: Color) -> some View {
        Text(label)
            .font(.caption2.weight(.medium))
            .foregroundStyle(.primary)
            .lineLimit(1)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.14), in: .capsule)
    }
}
