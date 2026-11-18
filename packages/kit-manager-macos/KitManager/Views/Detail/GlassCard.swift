import SwiftUI

/// A content card with an optional header and trailing controls.
struct GlassCard<Content: View, Trailing: View>: View {
    let title: String?
    let content: Content
    let trailing: Trailing

    init(
        _ title: String? = nil, @ViewBuilder content: () -> Content, @ViewBuilder trailing: () -> Trailing
    ) {
        self.title = title
        self.content = content()
        self.trailing = trailing()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
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
        .background(Color(nsColor: .controlBackgroundColor), in: .rect(cornerRadius: 8))
        .accessibilityElement(children: .contain)
    }
}

extension GlassCard where Trailing == EmptyView {
    init(_ title: String? = nil, @ViewBuilder content: () -> Content) {
        self.init(title, content: content, trailing: { EmptyView() })
    }
}
