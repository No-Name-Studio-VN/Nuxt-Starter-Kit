import SwiftUI

/// The last kit fetch outcome, shared by the sidebar and Overview.
struct KitFetchStatus: View {
    let state: FetchState

    var body: some View {
        switch state {
        case .idle, .fetching:
            HStack(spacing: 6) {
                ProgressView().controlSize(.mini).accessibilityHidden(true)
                Text("Checking for updates…")
            }
        case .fetched(let date):
            Text("Checked \(date, style: .relative) ago")
        case .offline:
            Text("Offline")
                .help("The kit could not be fetched. Showing the last known main.")
        }
    }
}
