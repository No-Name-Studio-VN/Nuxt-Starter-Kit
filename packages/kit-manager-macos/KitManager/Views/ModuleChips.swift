import SwiftUI

/// Up to three module names and a `+N` chip; the full list is in the tooltip and the VoiceOver label.
struct ModuleChips: View {
    let modules: [String]
    var limit = 3

    var body: some View {
        if modules.isEmpty {
            Text("—").foregroundStyle(.secondary)
        } else {
            HStack(spacing: 4) {
                ForEach(modules.prefix(limit), id: \.self) { chip($0) }
                if modules.count > limit {
                    chip("+\(modules.count - limit)", emphasized: true)
                }
            }
            .help(modules.joined(separator: ", "))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Modules: \(modules.joined(separator: ", "))")
        }
    }

    private func chip(_ text: String, emphasized: Bool = false) -> some View {
        Text(text)
            .font(.caption.weight(.medium))
            .lineLimit(1)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .foregroundStyle(emphasized ? Theme.amber : .primary)
            .background(Theme.hairline.opacity(0.55), in: .rect(cornerRadius: 4))
    }
}
