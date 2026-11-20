import SwiftUI

/// One Health tile: an icon, a status badge, and the headline value. The whole tile is a Liquid Glass
/// button that opens its details.
struct HealthTile: View {
    struct Status {
        let title: String
        let tone: StatusTone
    }

    let title: String
    let symbol: String
    let color: Color
    let value: String
    let detail: String
    let status: Status
    let isSelected: Bool
    /// A single row for stacked tiles in a narrow column, instead of the taller side-by-side card.
    var isCompact = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Group {
                if isCompact {
                    HStack(spacing: 12) {
                        SettingsIcon(symbol: symbol, color: color, size: 28)
                        text
                        Spacer(minLength: 6)
                        ToneBadge(title: status.title, tone: status.tone)
                    }
                } else {
                    VStack(alignment: .leading, spacing: 14) {
                        HStack(alignment: .center, spacing: 6) {
                            SettingsIcon(symbol: symbol, color: color, size: 28)
                            Spacer(minLength: 6)
                            ToneBadge(title: status.title, tone: status.tone)
                        }
                        text
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .buttonStyle(HealthTileButtonStyle(isSelected: isSelected))
        .help("\(value) · \(detail)")
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title): \(value). \(detail). \(status.title)")
        .accessibilityHint(isSelected ? "Hides the details" : "Shows the details below")
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    private var text: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline)
                .lineLimit(1)
                .truncationMode(.middle)
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.tail)
        }
    }
}

private struct HealthTileButtonStyle: ButtonStyle {
    let isSelected: Bool

    func makeBody(configuration: Configuration) -> some View {
        HealthTileBody(configuration: configuration, isSelected: isSelected)
    }
}

private struct HealthTileBody: View {
    let configuration: ButtonStyleConfiguration
    let isSelected: Bool

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isHovered = false

    private static let shape = RoundedRectangle(cornerRadius: 14, style: .continuous)

    var body: some View {
        configuration.label
            .contentShape(Self.shape)
            .background {
                Self.shape.fill(.fill.tertiary).opacity(isHovered ? 1 : 0)
            }
            .glassEffect(
                .regular.tint(isSelected ? Color.accentColor.opacity(0.18) : nil).interactive(),
                in: Self.shape
            )
            .overlay {
                Self.shape
                    .strokeBorder(Color.accentColor, lineWidth: 1.5)
                    .opacity(isSelected ? 1 : 0)
            }
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            .onHover { isHovered = $0 }
            .animation(.snappy(duration: 0.18), value: isHovered)
            .animation(.snappy(duration: 0.18), value: configuration.isPressed)
            .animation(.snappy(duration: 0.25), value: isSelected)
    }
}
