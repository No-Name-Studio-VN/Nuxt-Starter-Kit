import KitManagerCore
import SwiftUI

/// The center column for browsing kit releases.
struct ReleasesListView: View {
    @Binding var selection: String?
    @Binding var releases: Loadable<[ReleaseSection]>

    var body: some View {
        ContentUnavailableView("What's New", systemImage: "sparkles")
    }
}
