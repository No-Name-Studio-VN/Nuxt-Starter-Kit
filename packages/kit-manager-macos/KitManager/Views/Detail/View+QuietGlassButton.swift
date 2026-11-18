import SwiftUI

extension View {
    /// A small glass button that stays neutral, so the amber accent is kept for primary actions.
    func quietGlassButton() -> some View {
        buttonStyle(.glass)
            .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
            .controlSize(.small)
            .tint(.gray)
    }
}
