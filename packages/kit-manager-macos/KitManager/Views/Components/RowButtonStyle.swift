import SwiftUI

/// A plain button that fills its row and shows the system-style hover and press highlight. The
/// highlight bleeds a few points past the label, so text stays aligned with the rows around it.
struct RowButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        RowButton(configuration: configuration)
    }
}

private struct RowButton: View {
    let configuration: ButtonStyleConfiguration

    @Environment(\.isEnabled) private var isEnabled
    @State private var isHovered = false

    private static let shape = RoundedRectangle(cornerRadius: 7, style: .continuous)

    private var highlight: Double {
        guard isEnabled else { return 0 }
        if configuration.isPressed { return 1 }
        return isHovered ? 0.6 : 0
    }

    var body: some View {
        configuration.label
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 7)
            .padding(.vertical, 5)
            .contentShape(Self.shape)
            .background {
                Self.shape.fill(.fill.tertiary).opacity(highlight)
            }
            .padding(.horizontal, -7)
            .padding(.vertical, -3)
            .onHover { isHovered = $0 }
            .animation(.easeOut(duration: 0.12), value: highlight)
    }
}
