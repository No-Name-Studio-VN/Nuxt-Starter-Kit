import SwiftUI

extension View {
    /// A small glass button that stays neutral, so the system accent is kept for primary actions.
    func quietGlassButton() -> some View {
        buttonStyle(.glass)
            .controlSize(.small)
            .tint(.gray)
    }
}
