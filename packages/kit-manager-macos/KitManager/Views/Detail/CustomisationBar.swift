import KitManagerCore
import SwiftUI

/// The share of kit files edited, as one continuous capsule: the filled part is split by layer with
/// hairline gaps, and the rest of the track is the untouched kit.
struct CustomisationBar: View {
    let layers: [LayerCustomisation]
    /// Share of scored files edited or deleted, 0...1.
    let score: Double
    let color: (LayerCustomisation) -> Color
    let help: (LayerCustomisation) -> String

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isRevealed = false

    private static let height: CGFloat = 10
    private static let gap: CGFloat = 2
    /// Keeps a layer with one edited file visible on a track of hundreds.
    private static let minimumSegment: CGFloat = 5

    var body: some View {
        GeometryReader { proxy in
            let widths = Self.segmentWidths(layers.map(\.changed), score: score, in: proxy.size.width)
            HStack(spacing: Self.gap) {
                ForEach(Array(zip(layers, widths)), id: \.0.id) { layer, width in
                    Rectangle()
                        .fill(color(layer).gradient)
                        .frame(width: width)
                        .help(help(layer))
                }
            }
            .clipShape(.capsule)
            .scaleEffect(x: isRevealed ? 1 : 0, anchor: .leading)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(.fill.tertiary, in: .capsule)
        }
        .frame(height: Self.height)
        .onAppear {
            withAnimation(reduceMotion ? nil : .smooth(duration: 0.6).delay(0.05)) { isRevealed = true }
        }
        .accessibilityHidden(true)
    }

    /// Each layer's width: a fixed minimum plus its share of the space left in the filled part, so the
    /// segments always add up to exactly `score` of the track (or the minimums, whichever is wider).
    private static func segmentWidths(_ counts: [Int], score: Double, in width: CGFloat) -> [CGFloat] {
        let total = counts.reduce(0, +)
        guard total > 0, width > 0 else { return counts.map { _ in 0 } }
        let gaps = gap * CGFloat(counts.count - 1)
        let minimum = min(minimumSegment, max(0, width - gaps) / CGFloat(counts.count))
        let floor = minimum * CGFloat(counts.count) + gaps
        let filled = min(width, max(floor, width * CGFloat(score)))
        let spare = max(0, filled - floor)
        return counts.map { minimum + spare * CGFloat($0) / CGFloat(total) }
    }
}
