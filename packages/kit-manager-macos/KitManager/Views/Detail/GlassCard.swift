import SwiftUI

/// A dashboard card: a quiet uppercase label, optional trailing controls and a 6 pt glass surface
/// with a hairline edge. Solid when Reduce Transparency is on.
struct GlassCard<Content: View, Trailing: View>: View {
    let title: String?
    let content: Content
    let trailing: Trailing

    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    init(
        _ title: String? = nil, @ViewBuilder content: () -> Content, @ViewBuilder trailing: () -> Trailing
    ) {
        self.title = title
        self.content = content()
        self.trailing = trailing()
    }

    var body: some View {
        let card = VStack(alignment: .leading, spacing: 14) {
            if title != nil || Trailing.self != EmptyView.self {
                HStack(alignment: .center, spacing: 8) {
                    if let title {
                        Text(title)
                            .font(.caption.weight(.semibold))
                            .tracking(0.8)
                            .textCase(.uppercase)
                            .foregroundStyle(.secondary)
                            .accessibilityAddTraits(.isHeader)
                    }
                    Spacer(minLength: 8)
                    trailing
                }
            }
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)

        Group {
            if reduceTransparency {
                card.background(Theme.surface, in: .rect(cornerRadius: Theme.radius))
            } else {
                card.glassEffect(.regular, in: .rect(cornerRadius: Theme.radius))
            }
        }
        .overlay {
            RoundedRectangle(cornerRadius: Theme.radius).strokeBorder(Theme.hairline, lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
    }
}

extension GlassCard where Trailing == EmptyView {
    init(_ title: String? = nil, @ViewBuilder content: () -> Content) {
        self.init(title, content: content, trailing: { EmptyView() })
    }
}
