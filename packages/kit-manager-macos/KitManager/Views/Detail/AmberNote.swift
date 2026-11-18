import SwiftUI

/// A caption with a small amber dot, used for "uncommitted changes" notes.
struct AmberNote: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Label {
            Text(text).font(.caption).foregroundStyle(.secondary)
        } icon: {
            Circle().fill(Theme.amber).frame(width: 7, height: 7)
        }
    }
}
