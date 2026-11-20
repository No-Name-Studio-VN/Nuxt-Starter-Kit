import KitManagerCore
import SwiftUI

/// The unsaved-work assessment shown before an update or module change is applied.
struct TransitionRiskReview: View {
    let summary: UpgradeRiskSummary
    let files: [RiskyFile]
    @Binding var showsFiles: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Label {
                VStack(alignment: .leading, spacing: 3) {
                    Text(summary.title).fontWeight(.semibold)
                    if let detail = summary.detail {
                        Text(detail).font(.callout).foregroundStyle(.secondary)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
            }
            .accessibilityElement(children: .combine)

            meter
            legend

            DisclosureGroup("Show the \(summary.risky) \(summary.risky == 1 ? "file" : "files")", isExpanded: $showsFiles) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 7) {
                        ForEach(files, id: \.self) { file in
                            LabeledContent {
                                Text(file.kind.displayTitle).foregroundStyle(.secondary)
                            } label: {
                                Text(file.path).monospaced().textSelection(.enabled)
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                    .font(.caption)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 128)
                .defaultScrollAnchor(.top)
            }
        }
        .padding(12)
        .background(Color.orange.opacity(0.10), in: .rect(cornerRadius: 8))
        .overlay {
            RoundedRectangle(cornerRadius: 8).strokeBorder(Color.orange.opacity(0.32))
                .allowsHitTesting(false)
        }
    }

    private var meter: some View {
        GeometryReader { geometry in
            let visible = segments.filter { $0.count > 0 }
            let total = visible.reduce(0) { $0 + $1.count }
            let width = max(0, geometry.size.width - CGFloat(max(0, visible.count - 1) * 2))
            HStack(spacing: 2) {
                ForEach(visible) { segment in
                    Rectangle().fill(segment.color)
                        .frame(width: total == 0 ? 0 : width * CGFloat(segment.count) / CGFloat(total))
                }
            }
        }
        .frame(height: 8)
        .clipShape(.capsule)
        // Read the labelled legend once, not both the bar and its redundant labels.
        .accessibilityHidden(true)
    }

    private var legend: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 14) { legendItems }.fixedSize(horizontal: true, vertical: false)
            VStack(alignment: .leading, spacing: 4) { legendItems }
        }
        .font(.caption)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(segments.map(\.label).joined(separator: ", "))
    }

    private var legendItems: some View {
        ForEach(segments) { segment in
            Label {
                Text(segment.label).foregroundStyle(.secondary)
            } icon: {
                Image(systemName: segment.symbol).foregroundStyle(segment.color)
            }
        }
    }

    private var segments: [Segment] {
        [
            Segment(count: summary.risky, name: "at risk", symbol: "exclamationmark.triangle.fill", color: .orange),
            Segment(count: summary.touched, name: "merge cleanly", symbol: "arrow.triangle.merge", color: .accentColor),
            Segment(count: summary.untouched, name: "not touched", symbol: "checkmark.circle.fill", color: .green),
        ]
    }

    private struct Segment: Identifiable {
        let count: Int
        let name: String
        let symbol: String
        let color: Color

        var id: String { name }
        var label: String { "\(count) \(name)" }
    }
}

struct TransitionBackupToggle: View {
    @Binding var backsUp: Bool
    let hasUnsaved: Bool
    var isModuleChange = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Toggle(isOn: $backsUp) {
                HStack(spacing: 4) {
                    Text("Back up my project first").fontWeight(.medium)
                    Text("· Recommended").foregroundStyle(.secondary)
                }
            }
            .toggleStyle(.checkbox)
            .accessibilityHint(caption)
            Group {
                if backsUp || !hasUnsaved {
                    Text(caption)
                } else {
                    Label {
                        Text(caption)
                    } icon: {
                        Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    }
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var caption: String {
        let operation = isModuleChange ? "module change" : "update"
        if !backsUp && hasUnsaved {
            return "Without a backup, you won't be able to undo this \(operation)."
        }
        return "Saves everything, including new files, so you can undo the whole \(operation) with one click. Your branch and history aren't changed."
    }
}

struct TransitionGroupedCounts: View {
    let counts: GroupedChangeCounts

    var body: some View {
        row("Applied automatically", count: counts.appliedAutomatically, symbol: "checkmark.circle.fill", color: .green)
        row("Needs your decision afterwards", count: counts.needsDecision, symbol: "exclamationmark.triangle.fill", color: .orange)
        row("Keeps your version", count: counts.keptYourVersion, symbol: "arrow.uturn.backward", color: .purple,
            detail: "You'd changed these and the kit changed them too")
    }

    private func row(_ title: String, count: Int, symbol: String, color: Color, detail: String? = nil) -> some View {
        LabeledContent {
            Text(count.formatted()).monospacedDigit().foregroundStyle(.secondary)
        } label: {
            HStack(spacing: 8) {
                SettingsIcon(symbol: symbol, color: color, size: 22).accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                    if let detail, count > 0 {
                        Text(detail).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}
