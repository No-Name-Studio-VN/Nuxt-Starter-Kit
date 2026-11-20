import SwiftUI

/// A disclosure whose whole label row toggles it, with a hover highlight and a rotating chevron. The
/// system style on macOS only responds to its small chevron.
struct RowDisclosureStyle: DisclosureGroupStyle {
    func makeBody(configuration: Configuration) -> some View {
        RowDisclosure(configuration: configuration)
    }
}

extension DisclosureGroupStyle where Self == RowDisclosureStyle {
    static var row: RowDisclosureStyle { RowDisclosureStyle() }
}

private struct RowDisclosure: View {
    let configuration: DisclosureGroupStyleConfiguration

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(reduceMotion ? nil : .snappy(duration: 0.28)) {
                    configuration.isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 7) {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(configuration.isExpanded ? 90 : 0))
                        .frame(width: 12)
                        .accessibilityHidden(true)
                    configuration.label
                }
            }
            .buttonStyle(RowButtonStyle())
            .accessibilityValue(configuration.isExpanded ? "Expanded" : "Collapsed")
            .accessibilityHint(configuration.isExpanded ? "Hides the details" : "Shows the details")

            if configuration.isExpanded {
                VStack(alignment: .leading, spacing: 8) {
                    configuration.content
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 10)
                .padding(.bottom, 2)
                .transition(.opacity.combined(with: .offset(y: -6)))
            }
        }
        #if DEBUG
        .onAppear {
            if DebugLaunchOptions.expandsDisclosures { configuration.isExpanded = true }
        }
        #endif
    }
}
