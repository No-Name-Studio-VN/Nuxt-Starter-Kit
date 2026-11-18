import KitManagerCore
import SwiftUI

/// The project filters, kit pages and fetch status in the leading column.
struct SidebarView: View {
    let projectCount: Int

    @Environment(AppModel.self) private var model

    var body: some View {
        let sidebar = Bindable(model).sidebar
        let selection = Binding<SidebarItem?>(
            get: { sidebar.wrappedValue },
            set: { if let item = $0 { sidebar.wrappedValue = item } }
        )
        List(selection: selection) {
            Section("Projects") {
                row(.allProjects, count: projectCount)
                row(.needsAttention, count: model.attentionCount)
            }
            Section("Status") {
                ForEach(StatusFilter.allCases, id: \.self) { filter in
                    let item = SidebarItem.status(filter)
                    row(item, count: model.count(for: item))
                }
            }
            Section("Kit") {
                row(.modules)
                row(.whatsNew)
            }
        }
        .safeAreaInset(edge: .bottom) { footer }
        .navigationSplitViewColumnWidth(min: 200, ideal: 220)
    }

    private func row(_ item: SidebarItem, count: Int = 0) -> some View {
        Label(item.title, systemImage: item.symbol)
            .badge(count)
            .accessibilityLabel(count > 0 ? "\(item.title), \(count) projects" : item.title)
            .tag(item)
    }

    private var footer: some View {
        HStack(spacing: 8) {
            Image(systemName: "shippingbox")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 0) {
                Text("Kit \(model.latestLabel ?? "—")")
                    .font(.callout.weight(.medium))
                fetchStatus
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .padding(12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .contextMenu {
            Button("Check Now") { Task { await model.fetchKit() } }
                .disabled(model.fetchState == .fetching)
        }
    }

    @ViewBuilder
    private var fetchStatus: some View {
        switch model.fetchState {
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
