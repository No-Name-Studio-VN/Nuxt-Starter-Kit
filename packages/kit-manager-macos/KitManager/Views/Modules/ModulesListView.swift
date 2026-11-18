import SwiftUI

/// The center column for browsing kit modules.
struct ModulesListView: View {
    @Binding var selection: String?

    var body: some View {
        ContentUnavailableView("Modules", systemImage: "puzzlepiece.extension")
    }
}
