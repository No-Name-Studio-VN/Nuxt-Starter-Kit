import SwiftUI

/// A Finder-style project icon: a continuous rounded square with the project's initial.
struct ProjectIcon: View {
    let name: String
    var size: CGFloat = 32

    private static let palette: [Color] = [.blue, .purple, .pink, .orange, .teal, .indigo, .green, .mint, .cyan, .red]

    var body: some View {
        let seed = name.unicodeScalars.reduce(0) { $0 + Int($1.value) }
        let color = Self.palette[seed % Self.palette.count]
        RoundedRectangle(cornerRadius: size * 0.24, style: .continuous)
            .fill(color.gradient)
            .overlay {
                Text(String(name.prefix(1)).uppercased())
                    .font(.system(size: size * 0.5, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
            }
            .frame(width: size, height: size)
            .shadow(color: .black.opacity(0.12), radius: 1, y: 0.5)
            .accessibilityHidden(true)
    }
}
