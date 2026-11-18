import KitManagerCore
import SwiftUI

/// The project filters, kit pages and fetch status in the leading column.
struct SidebarView: View {
    let projects: [Project]

    @Environment(AppModel.self) private var model

    var body: some View {
        let sidebar = Bindable(model).sidebar
        let selection = Binding<SidebarItem?>(
            get: { sidebar.wrappedValue },
            set: { if let item = $0 { sidebar.wrappedValue = item } }
        )
        let counts = model.counts(for: SidebarItem.projectItems, in: projects)
        List(selection: selection) {
            Section("Projects") {
                row(.allProjects, count: counts[.allProjects, default: 0])
                row(.needsAttention, count: counts[.needsAttention, default: 0])
            }
            Section("Status") {
                ForEach(StatusFilter.allCases, id: \.self) { filter in
                    let item = SidebarItem.status(filter)
                    row(item, count: counts[item, default: 0])
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
                KitFetchStatus(state: model.fetchState)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            Spacer(minLength: 0)
            Button("Check Now", systemImage: "arrow.clockwise", action: checkNow)
                .labelStyle(.iconOnly)
                .buttonStyle(.borderless)
                .controlSize(.small)
                .help("Check the kit for updates now")
                .disabled(model.fetchState == .fetching)
        }
        .padding(12)
        .contentShape(Rectangle())
        .contextMenu {
            Button("Check Now", action: checkNow)
                .disabled(model.fetchState == .fetching)
        }
    }

    private func checkNow() {
        Task { await model.fetchKit() }
    }
}
