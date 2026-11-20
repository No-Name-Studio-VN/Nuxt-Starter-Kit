import SwiftUI

/// A small tinted capsule naming a state, with a symbol or a dot in the tone's colour.
struct ToneBadge: View {
    let title: String
    let tone: StatusTone
    var symbol: String? = nil

    var body: some View {
        HStack(spacing: 4) {
            if let symbol {
                Image(systemName: symbol).accessibilityHidden(true)
            } else {
                Circle()
                    .fill(tone.color)
                    .frame(width: 6, height: 6)
                    .accessibilityHidden(true)
            }
            Text(title)
        }
        .accessibilityElement(children: .combine)
        .font(.caption.weight(.medium))
        .lineLimit(1)
        .fixedSize()
        .foregroundStyle(tone == .neutral ? Color.secondary : tone.color)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background((tone == .neutral ? Color.gray : tone.color).opacity(0.15), in: .capsule)
    }
}
