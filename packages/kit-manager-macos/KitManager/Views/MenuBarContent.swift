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
                .frame(height: min(Self.listHeight, CGFloat(rows.count) * 46 + 10))
            }
            Divider()
            footer
        }
        .frame(width: 340)
    }

    // MARK: Parts

    private var header: some View {
        let count = model.attentionCount
        return HStack(spacing: 8) {
            Image(systemName: count > 0 ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                .foregroundStyle(count > 0 ? Color.orange : Color.green)
                .accessibilityHidden(true)
            Text(MenuBarLabel.attentionSummary(count)).font(.headline)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }

    private func projectRow(_ row: ProjectRow) -> some View {
        HStack(spacing: 8) {
            Button {
                show(row)
            } label: {
                HStack(spacing: 8) {
                    ProjectIcon(name: row.name, size: 22)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(row.name).fontWeight(.medium).lineLimit(1)
                        StatusLabel(status: row.status)
                            .font(.caption)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help("Open \(row.name) in Kit Manager")
            OpenButtons(project: row.project, row: row, onLocate: {}, compact: true, showsMenu: false)
                .environment(model)
        }
        .padding(.horizontal, 8)
        .frame(height: 44)
    }

    private var footer: some View {
        HStack(spacing: 8) {
            Button("Open Kit Manager") { showWindow() }
                .buttonStyle(.glassProminent)
            Spacer(minLength: 0)
            Button("Refresh") { Task { await model.refreshAll(force: true) } }
                .buttonStyle(.glass)
            Button("Quit") { NSApp.terminate(nil) }
                .buttonStyle(.glass)
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
