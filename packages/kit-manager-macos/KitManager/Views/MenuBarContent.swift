import AppKit
import KitManagerCore
import SwiftUI

/// The menu bar extra's window: how many projects need attention, every project with its open
/// actions, and a way back to the main window. `MenuBarExtra` is its own scene, so the model is
/// passed in instead of read from the environment.
struct MenuBarContent: View {
    let model: AppModel

    @Environment(\.openWindow) private var openWindow

    private var rows: [ProjectRow] {
        model.fetchProjects()
            .map { ProjectRow(project: $0, snapshot: model.snapshots[$0.id]) }
            .sorted { lhs, rhs in
                if lhs.attention.isEmpty != rhs.attention.isEmpty { return !lhs.attention.isEmpty }
                return lhs.name.localizedStandardCompare(rhs.name) == .orderedAscending
            }
    }

    private static let listHeight: CGFloat = 360

    var body: some View {
        let rows = rows
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            if rows.isEmpty {
                Text("No projects yet.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, minHeight: 80)
            } else {
                ScrollView {
                    LazyVStack(spacing: 2) {
                        ForEach(rows) { row in
                            projectRow(row)
                        }
                    }
                    .padding(6)
                }
                .frame(height: min(Self.listHeight, CGFloat(rows.count) * 56 + 12))
            }
            Divider()
            footer
        }
        .frame(width: 480)
    }

    // MARK: Parts

    private var header: some View {
        let count = model.attentionCount
        return HStack(spacing: 8) {
            Image(systemName: count > 0 ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                .foregroundStyle(count > 0 ? Color.orange : Color.green)
                .accessibilityHidden(true)
            Text(title(for: count)).font(.headline)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private func title(for count: Int) -> String {
        if model.snapshots.isEmpty { return "Kit Manager" }
        if count == 0 { return "All projects are fine" }
        return count == 1 ? "1 project needs attention" : "\(count) projects need attention"
    }

    private func projectRow(_ row: ProjectRow) -> some View {
        HStack(spacing: 10) {
            Button {
                show(row)
            } label: {
                VStack(alignment: .leading, spacing: 1) {
                    Text(row.name).fontWeight(.medium).lineLimit(1)
                    Text(row.kitLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Open \(row.name) in Kit Manager")
            StatusPill(status: row.status)
            OpenButtons(project: row.project, row: row, onLocate: {}, compact: true, showsMenu: false)
                .environment(model)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .frame(height: 54)
    }

    private var footer: some View {
        HStack {
            Button("Open Kit Manager") { showWindow() }
                .buttonStyle(.glassProminent)
                .controlSize(.regular)
            Spacer(minLength: 0)
            Button("Quit") { NSApp.terminate(nil) }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .keyboardShortcut("q")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
    }

    // MARK: Actions

    private func show(_ row: ProjectRow) {
        model.openDetail(row.project)
        showWindow()
    }

    private func showWindow() {
        openWindow(id: KitManagerApp.mainWindowID)
        NSApp.activate()
    }
}
