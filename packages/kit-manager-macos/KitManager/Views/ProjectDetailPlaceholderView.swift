import SwiftUI

/// The detail page arrives in a later task; this keeps navigation working.
struct ProjectDetailPlaceholderView: View {
    let row: ProjectRow

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(row.name).font(.largeTitle.weight(.semibold))
            Text(row.displayPath).font(.callout).foregroundStyle(.secondary).textSelection(.enabled)
            StatusBadge(status: row.status).padding(.top, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(24)
        .background(Theme.canvas)
        .navigationTitle(row.name)
    }
}
