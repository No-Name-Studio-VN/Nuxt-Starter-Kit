import SwiftUI

/// A thin horizontal meter, 0 to 1, with a hairline track.
struct ScoreMeter: View {
    let value: Double
    var height: CGFloat = 6

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 3).fill(Theme.hairline.opacity(0.7))
                RoundedRectangle(cornerRadius: 3)
                    .fill(Theme.amber)
                    .frame(width: max(value > 0 ? 3 : 0, proxy.size.width * min(max(value, 0), 1)))
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
    }
}
