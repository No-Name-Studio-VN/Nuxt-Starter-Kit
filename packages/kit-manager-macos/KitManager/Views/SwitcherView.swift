import KitManagerCore
import SwiftUI

/// The ⌘K project switcher: type to filter, arrows to move, Return for the detail page and
/// ⌘Return for Claude in that folder.
struct SwitcherView: View {
    let projects: [Project]
    /// Passed in, not read from the environment, like every view built outside the main window's content.
    let model: AppModel
    let onOpen: (Project) -> Void
    let onClaude: (Project) -> Void

    @State private var query = ""
    @State private var selected: UUID?
    @FocusState private var isSearchFocused: Bool

    private static let rowHeight: CGFloat = 46
    private static let visibleRows: CGFloat = 7

    private var rows: [ProjectRow] {
        let all = projects.map { ProjectRow(project: $0, snapshot: model.snapshots[$0.id]) }
        let candidates = all.map { SwitcherCandidate(id: $0.id, name: $0.name, path: $0.project.path) }
        let byID = Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0) })
        return SwitcherRanking.rank(query: query, candidates: candidates).compactMap { byID[$0] }
    }

    var body: some View {
        let rows = rows
        let current = selected.flatMap { id in rows.first { $0.id == id } } ?? rows.first
        VStack(spacing: 0) {
            searchField(rows: rows, current: current)
            Divider()
            results(rows, current: current)
            Divider()
            hints
        }
        .frame(width: 540)
        .background(Theme.canvas)
        .onAppear { isSearchFocused = true }
        .onChange(of: query) { selected = nil }
    }

    private func searchField(rows: [ProjectRow], current: ProjectRow?) -> some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            TextField("Jump to a project", text: $query)
                .textFieldStyle(.plain)
                .font(.title3)
                .focused($isSearchFocused)
                .accessibilityLabel("Search projects")
                .onKeyPress(.downArrow) { move(1, in: rows, from: current) }
                .onKeyPress(.upArrow) { move(-1, in: rows, from: current) }
                .onKeyPress(keys: [.return]) { press in
                    guard let current else { return .handled }
                    if press.modifiers.contains(.command) {
                        onClaude(current.project)
                    } else {
                        onOpen(current.project)
                    }
                    return .handled
                }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
    }

    @ViewBuilder
    private func results(_ rows: [ProjectRow], current: ProjectRow?) -> some View {
        if rows.isEmpty {
            Text(projects.isEmpty ? "No projects yet." : "No project matches \u{201C}\(query)\u{201D}.")
                .font(.callout)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, minHeight: Self.rowHeight * 2)
        } else {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(rows) { row in
                            resultRow(row, isCurrent: row.id == current?.id)
                                .id(row.id)
                        }
                    }
                    .padding(6)
                }
                .frame(height: min(CGFloat(rows.count), Self.visibleRows) * (Self.rowHeight + 2) + 12)
                .onChange(of: current?.id) { _, id in
                    if let id { proxy.scrollTo(id) }
                }
            }
        }
    }

    private func resultRow(_ row: ProjectRow, isCurrent: Bool) -> some View {
        Button {
            onOpen(row.project)
        } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(row.name).fontWeight(.medium).lineLimit(1)
                    Text(row.displayPath)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Spacer(minLength: 8)
                if row.isKitProject || row.kitLabel == "2.x" {
                    Text(row.kitLabel)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                }
            }
            .padding(.horizontal, 10)
            .frame(height: Self.rowHeight)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                isCurrent ? Theme.amber.opacity(0.16) : Color.clear, in: .rect(cornerRadius: Theme.radius)
            )
            .overlay {
                if isCurrent {
                    RoundedRectangle(cornerRadius: Theme.radius).strokeBorder(Theme.amber.opacity(0.45), lineWidth: 1)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
    }

    private var hints: some View {
        HStack(spacing: 16) {
            hint("↑↓", "move")
            hint("↩", "details")
            hint("⌘↩", "Claude")
            hint("esc", "close")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Up and down arrows move, Return opens details, Command Return starts Claude, Escape closes")
    }

    private func hint(_ keys: String, _ action: String) -> some View {
        HStack(spacing: 4) {
            Text(keys).font(.caption.weight(.semibold)).foregroundStyle(.primary)
            Text(action)
        }
    }

    private func move(_ step: Int, in rows: [ProjectRow], from current: ProjectRow?) -> KeyPress.Result {
        guard !rows.isEmpty else { return .handled }
        let index = current.flatMap { current in rows.firstIndex { $0.id == current.id } } ?? 0
        selected = rows[min(max(index + step, 0), rows.count - 1)].id
        return .handled
    }
}
