import KitManagerCore
import SwiftUI

/// The center column for browsing kit modules.
struct ModulesListView: View {
    let rows: [ModuleMatrix.Row]
    let kitProjectCount: Int
    let searchText: String
    @Binding var selection: String?

    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// Collapsed kit group names, one per line.
    @AppStorage("collapsedModuleGroups") private var collapsedStorage = ""

    private var query: String { searchText.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var visibleRows: [ModuleMatrix.Row] {
        guard !query.isEmpty else { return rows }
        return rows.filter { row in
            row.module.title.localizedStandardContains(query)
                || row.id.localizedStandardContains(query)
                || row.module.description.localizedStandardContains(query)
        }
    }

    private var collapsedGroups: Set<String> {
        Set(collapsedStorage.split(separator: "\n").map(String.init))
    }

    /// Every group opens while searching, so a match is never hidden in a collapsed one.
    private func isExpanded(_ group: String) -> Bool {
        !query.isEmpty || !collapsedGroups.contains(group)
    }

    private func toggle(_ group: String) {
        guard query.isEmpty else { return }
        var groups = collapsedGroups
        if groups.contains(group) { groups.remove(group) } else { groups.insert(group) }
        withAnimation(reduceMotion ? nil : .snappy) {
            collapsedStorage = groups.sorted().joined(separator: "\n")
        }
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("Modules")
            .navigationSplitViewColumnWidth(min: 260, ideal: 300)
    }

    @ViewBuilder
    private var content: some View {
        if model.catalogue.isEmpty {
            ContentUnavailableView(
                "Modules unavailable", systemImage: SidebarItem.modules.symbol,
                description: Text(
                    model.cliStatus == .ready
                        ? "Couldn't read the kit's module list. Refresh to try again."
                        : "The nuxt-saas CLI must be ready to read the module list."))
        } else if rows.isEmpty {
            ContentUnavailableView(
                "No kit projects", systemImage: SidebarItem.modules.symbol,
                description: Text("Add a project made with the kit to see which modules it uses."))
        } else {
            let visible = visibleRows
            if visible.isEmpty {
                ContentUnavailableView.search(text: query)
            } else {
                List(selection: $selection) {
                    ForEach(groupModules(visible, module: \.module)) { group in
                        if let name = group.name {
                            let expanded = isExpanded(name)
                            Section {
                                if expanded { moduleRows(group.entries) }
                            } header: {
                                groupHeader(name, count: group.entries.count, expanded: expanded)
                            }
                        } else {
                            moduleRows(group.entries)
                        }
                    }
                }
                .accessibilityLabel("Modules")
                .navigationSubtitle(subtitle(visible: visible.count))
            }
        }
    }

    private func groupHeader(_ name: String, count: Int, expanded: Bool) -> some View {
        let modules = count == 1 ? "1 module" : "\(count) modules"
        return Button {
            toggle(name)
        } label: {
            HStack(spacing: 6) {
                Text(name)
                if !expanded {
                    Text(modules)
                        .foregroundStyle(.tertiary)
                }
                Spacer(minLength: 4)
                if query.isEmpty {
                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(expanded ? 90 : 0))
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .help(expanded ? "Collapse \(name)" : "Expand \(name)")
        .accessibilityLabel("\(name), \(modules)")
        .accessibilityValue(expanded ? "Expanded" : "Collapsed")
        .accessibilityHint(expanded ? "Hides the modules in this group" : "Shows the modules in this group")
        .accessibilityAddTraits(.isHeader)
    }

    private func subtitle(visible: Int) -> String {
        let total = rows.count == 1 ? "1 module" : "\(rows.count) modules"
        return query.isEmpty ? total : "\(visible) of \(total)"
    }

    private func moduleRows(_ entries: [ModuleSection<ModuleMatrix.Row>.Entry]) -> some View {
        ForEach(entries) { entry in
            moduleRow(entry.item, depth: entry.depth)
        }
    }

    private func moduleRow(_ row: ModuleMatrix.Row, depth: Int) -> some View {
        let id = row.id
        let title = row.module.title.isEmpty ? id : row.module.title
        let count = row.installedCount == 1 ? "1 project" : "\(row.installedCount) projects"
        let behind = row.behindCount > 0 ? ", \(row.behindCount) behind" : ""
        let spokenTitle = id == title ? title : "\(title), \(id)"
        let internalLabel = row.module.internal ? ", internal" : ""
        let installedHelp = "\(row.installedCount) of \(kitProjectCount) kit projects use \(id)."
        let behindHelp = row.behindCount == 0
            ? "No project is behind on this module."
            : "\(row.behindCount) of those projects are behind on a change to this module."
        return HStack(spacing: 10) {
            SettingsIcon(symbol: ModuleAppearance.symbol(for: id), color: ModuleAppearance.color(for: id), size: 34)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .fontWeight(.semibold)
                    .lineLimit(1)
                Text("\(count)\(behind)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            if row.module.internal {
                Text("Internal")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 3)
        .padding(.leading, CGFloat(depth) * 16)
        .help("\(title) · \(installedHelp) \(behindHelp)")
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(spokenTitle), \(count), \(row.behindCount) behind\(internalLabel)")
        .accessibilityHint("Shows the module and the projects that use it")
        .tag(id)
    }
}
