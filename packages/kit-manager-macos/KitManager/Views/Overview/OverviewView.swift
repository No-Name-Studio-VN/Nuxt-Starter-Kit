import SwiftUI

/// The project overview shown when no project is selected.
struct OverviewView: View {
    let projects: [Project]

    var body: some View {
        ContentUnavailableView("Overview", systemImage: "square.stack.3d.up")
    }
}
