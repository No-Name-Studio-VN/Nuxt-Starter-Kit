import SwiftUI

/// A failure message with a "Show details" disclosure for stderr.
struct FailureView: View {
    let error: PresentedError

    init(_ error: PresentedError) {
        self.error = error
    }

    init(message: String) {
        error = PresentedError(message: message)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label {
                Text(error.message)
                    .font(.callout)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            } icon: {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Color.red)
            }
            if let details = error.details {
                DisclosureGroup("Show details") {
                    ScrollView {
                        Text(details)
                            .font(.caption.monospaced())
                            .textSelection(.enabled)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .frame(maxHeight: 140)
                    .padding(8)
                    .background(.fill.quaternary, in: .rect(cornerRadius: 8))
                }
                .font(.caption)
            }
        }
        .accessibilityElement(children: .contain)
    }
}
