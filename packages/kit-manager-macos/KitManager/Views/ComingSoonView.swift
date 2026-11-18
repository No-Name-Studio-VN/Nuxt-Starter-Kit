import SwiftUI

/// Stands in for pages that a later task builds.
struct ComingSoonView: View {
    let item: SidebarItem

    var body: some View {
        ContentUnavailableView(
            item.title, systemImage: item.symbol,
            description: Text("This page is not built yet."))
            .background(Theme.canvas)
            .navigationTitle(item.title)
    }
}
