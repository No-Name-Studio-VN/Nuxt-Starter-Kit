import SwiftUI

/// A project count that also selects its sidebar filter.
struct OverviewTile: View {
    let value: Int
    let title: String
    let symbol: String
    let color: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 6) {
                Image(systemName: symbol)
                    .font(.title3)
                    .foregroundStyle(color)
                    .frame(height: 18)
                Text(value, format: .number).font(.title.weight(.semibold)).monospacedDigit()
                Text(title).font(.callout).foregroundStyle(.secondary).lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(.fill.quaternary, in: .rect(cornerRadius: 12, style: .continuous))
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(title): \(value)")
    }
}
