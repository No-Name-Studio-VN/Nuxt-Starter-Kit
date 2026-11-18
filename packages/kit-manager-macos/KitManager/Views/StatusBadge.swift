import KitManagerCore
import SwiftUI

/// Keeps existing status badge call sites on the shared pill until their views are updated.
struct StatusBadge: View {
    let status: ProjectStatus

    var body: some View {
        StatusPill(status: status)
    }
}
