import SwiftUI

/// Adds folders dropped onto the center list or welcome screen.
struct ProjectDropTarget: ViewModifier {
    @Environment(AppModel.self) private var model
    @State private var isTargeted = false

    func body(content: Content) -> some View {
        content
            .overlay {
                if isTargeted {
                    let shape = RoundedRectangle(cornerRadius: 12, style: .continuous)
                    shape
                        .strokeBorder(Color.accentColor, style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                        .background(Color.accentColor.opacity(0.06), in: shape)
                        .padding(8)
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                }
            }
            .dropDestination(for: URL.self) { urls, _ in
                model.add(urls: urls) > 0
            } isTargeted: {
                isTargeted = $0
            }
    }
}
