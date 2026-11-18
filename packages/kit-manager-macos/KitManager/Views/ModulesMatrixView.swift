import KitManagerCore
import SwiftUI

/// Which kit v3 projects have which module, and how many of them are behind on a commit that
/// touched it. A row filters the projects table to the projects with that module.
struct ModulesMatrixView: View {
    let projects: [Project]
    let onSelect: (String) -> Void

    @Environment(AppModel.self) private var model

    private static let cell: CGFloat = 24
    private static let summaryWidth: CGFloat = 240
    private static let countWidth: CGFloat = 68

    private var columns: [ModuleMatrix.Column] {
        ModuleMatrix.columns(from: projects.compactMap { project in
            model.snapshots[project.id].map { (id: project.id, snapshot: $0) }
        })
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Theme.canvas)
            .navigationTitle("Modules")
    }

    @ViewBuilder
    private var content: some View {
        let columns = columns
        if model.catalogue.isEmpty {
            ContentUnavailableView(
                "No module list", systemImage: "square.grid.3x3",
                description: Text(
                    model.cliStatus == .ready
                        ? "The kit's module list could not be read yet. Refresh to try again."
                        : "Modules come from the nuxt-saas CLI, which is not ready."))
        } else if columns.isEmpty {
            ContentUnavailableView(
                "No kit projects", systemImage: "square.grid.3x3",
                description: Text("Add a project made with the kit to see which modules it has."))
        } else {
            matrix(columns: columns)
        }
    }

    private func matrix(columns: [ModuleMatrix.Column]) -> some View {
        let rows = ModuleMatrix.rows(catalogue: model.catalogue, columns: columns)
        let names = Dictionary(
            uniqueKeysWithValues: projects.map { project in
                (project.id, ProjectRow(project: project, snapshot: model.snapshots[project.id]).name)
            })
        // Tall enough for the longest name, which runs up the page.
        let headerHeight = min(max(CGFloat(names.values.map(\.count).max() ?? 0) * 6.5 + 10, 56), 150)
        // The cards stretch to the window; the page only scrolls sideways once the project columns no longer fit.
        return GeometryReader { proxy in
            // What the matrix needs at least (names, two counts, a cell per project). It takes all the
            // width left, with the Overview card beside it when that still fits and above it when not.
            let nameWidth = nameColumnWidth(rows)
            let count = CGFloat(columns.count)
            let minimum = 32 + nameWidth + 2 * Self.countWidth + 6 * (count + 2) + Self.cell * count
            let sideBySide = proxy.size.width - 40 >= minimum + 16 + Self.summaryWidth
            let matrixWidth = max(minimum, proxy.size.width - 40 - (sideBySide ? 16 + Self.summaryWidth : 0))
            // The cells share what is left once the names and counts have their width.
            let cellWidth = max(
                Self.cell, (matrixWidth - 32 - nameWidth - 2 * Self.countWidth - 6 * (count + 2)) / max(count, 1))
            ScrollView([.horizontal, .vertical]) {
                Group {
                    if sideBySide {
                        HStack(alignment: .top, spacing: 16) {
                            matrixCard(rows: rows, columns: columns, names: names, headerHeight: headerHeight, nameWidth: nameWidth, cellWidth: cellWidth)
                                .frame(width: matrixWidth)
                            summaryCard(rows: rows, columns: columns, compact: false)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 16) {
                            summaryCard(rows: rows, columns: columns, compact: true)
                            matrixCard(rows: rows, columns: columns, names: names, headerHeight: headerHeight, nameWidth: nameWidth, cellWidth: cellWidth)
                        }
                        .frame(width: matrixWidth, alignment: .leading)
                    }
                }
                .padding(20)
            }
        }
    }

    private func matrixCard(
        rows: [ModuleMatrix.Row], columns: [ModuleMatrix.Column], names: [UUID: String], headerHeight: CGFloat,
        nameWidth: CGFloat, cellWidth: CGFloat
    ) -> some View {
        GlassCard {
            Grid(alignment: .center, horizontalSpacing: 6, verticalSpacing: 6) {
                GridRow {
                    Color.clear.gridCellUnsizedAxes([.horizontal, .vertical])
                    columnTitle("Projects", height: headerHeight)
                    columnTitle("Behind", height: headerHeight)
                    ForEach(columns) { column in
                        projectHeader(names[column.id] ?? "Project", height: headerHeight, width: cellWidth)
                    }
                }
                ForEach(rows) { row in
                    GridRow {
                        nameCell(row, width: nameWidth)
                        countCell("\(row.installedCount)", row: row, tint: false, help: installedHelp(row, total: columns.count))
                        countCell(
                            row.behindCount == 0 ? "—" : "\(row.behindCount)", row: row, tint: row.behindCount > 0,
                            help: behindHelp(row))
                        ForEach(columns) { column in
                            markCell(row: row, column: column, name: names[column.id] ?? "Project", width: cellWidth)
                        }
                    }
                    .opacity(row.module.internal ? 0.55 : 1)
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }

    /// Big numbers and the key to the marks, so the page reads as a dashboard even with few projects.
    /// `compact` lays it out as a strip above the matrix when the window is too narrow for two columns.
    private func summaryCard(rows: [ModuleMatrix.Row], columns: [ModuleMatrix.Column], compact: Bool) -> some View {
        let inUse = rows.filter { $0.installedCount > 0 }.count
        let behind = Set(rows.flatMap(\.behind)).count
        let layout = compact ? AnyLayout(HStackLayout(alignment: .top, spacing: 28)) : AnyLayout(VStackLayout(alignment: .leading, spacing: 16))
        return GlassCard("Overview") {
            layout {
                stat("\(columns.count)", columns.count == 1 ? "kit project" : "kit projects")
                stat("\(inUse) of \(rows.count)", "modules in use")
                stat("\(behind)", behind == 1 ? "project behind on a module" : "projects behind on a module", tint: behind > 0)
                if compact { Spacer(minLength: 0) } else { Divider() }
                VStack(alignment: .leading, spacing: 8) {
                    key(fill: Theme.amber.opacity(0.55), "Installed")
                    key(fill: Theme.amber, "Behind on a commit that touched it")
                    key(fill: Color.primary.opacity(0.04), "Not installed")
                    Text("Click a row to filter the projects.")
                        .foregroundStyle(.secondary)
                        .padding(.top, 4)
                }
                .font(.caption)
            }
        }
        .frame(width: compact ? nil : Self.summaryWidth)
        .frame(maxWidth: compact ? .infinity : nil)
    }

    private func stat(_ value: String, _ label: String, tint: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(.system(size: 28, weight: .semibold).monospacedDigit())
                .foregroundStyle(tint ? Theme.amber : Color.primary)
            Text(label).font(.callout).foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }

    private func key(fill: Color, _ text: String) -> some View {
        HStack(spacing: 8) {
            RoundedRectangle(cornerRadius: 4)
                .fill(fill)
                .overlay { RoundedRectangle(cornerRadius: 4).strokeBorder(Color.primary.opacity(0.18), lineWidth: 1) }
                .frame(width: 14, height: 14)
            Text(text)
        }
        .accessibilityElement(children: .combine)
    }

    /// Wide enough for the longest module name (an estimate; the text is one line).
    private func nameColumnWidth(_ rows: [ModuleMatrix.Row]) -> CGFloat {
        let longest = rows.map { $0.module.id.count + ($0.module.internal ? 10 : 0) }.max() ?? 0
        return CGFloat(longest) * 6.0 + 8
    }

    // MARK: Header

    private func columnTitle(_ text: String, height: CGFloat) -> some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .tracking(0.8)
            .textCase(.uppercase)
            .foregroundStyle(.secondary)
            .lineLimit(1)
            .frame(width: Self.countWidth, height: height, alignment: .bottom)
    }

    /// The name runs up the page so many projects fit in a narrow grid.
    private func projectHeader(_ name: String, height: CGFloat, width: CGFloat) -> some View {
        Color.clear
            .frame(width: width, height: height)
            .overlay {
                Text(name)
                    .font(.caption)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .frame(width: height, height: Self.cell, alignment: .leading)
                    .rotationEffect(.degrees(-90), anchor: .center)
            }
            .help(name)
            .accessibilityHidden(true)
    }

    // MARK: Cells

    private func nameCell(_ row: ModuleMatrix.Row, width: CGFloat) -> some View {
        Button {
            onSelect(row.module.id)
        } label: {
            HStack(spacing: 6) {
                Text(row.module.id)
                    .font(.callout.weight(.medium))
                    .lineLimit(1)
                    .foregroundStyle(model.moduleFilter == row.module.id ? Theme.amber : Color.primary)
                if row.module.internal {
                    Text("internal").font(.caption2).foregroundStyle(.secondary)
                }
            }
            .frame(width: width, height: Self.cell, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .gridColumnAlignment(.leading)
        .help(row.module.title.isEmpty ? row.module.id : row.module.title)
        .accessibilityLabel("\(row.module.id), \(row.installedCount) projects, \(row.behindCount) behind")
        .accessibilityHint("Shows the projects with this module")
    }

    private func countCell(_ text: String, row: ModuleMatrix.Row, tint: Bool, help: String) -> some View {
        Text(text)
            .font(.callout.monospacedDigit().weight(tint ? .semibold : .regular))
            .foregroundStyle(tint ? Theme.amber : Color.secondary)
            .frame(width: Self.countWidth, height: Self.cell)
            .contentShape(Rectangle())
            .onTapGesture { onSelect(row.module.id) }
            .help(help)
            .accessibilityHidden(true)
    }

    private func markCell(row: ModuleMatrix.Row, column: ModuleMatrix.Column, name: String, width: CGFloat) -> some View {
        let installed = row.installed.contains(column.id)
        let isBehind = row.behind.contains(column.id)
        return RoundedRectangle(cornerRadius: 4)
            .fill(installed ? Theme.amber.opacity(isBehind ? 1 : 0.55) : Color.primary.opacity(0.04))
            .overlay {
                if !installed { RoundedRectangle(cornerRadius: 4).strokeBorder(Color.primary.opacity(0.18), lineWidth: 1) }
            }
            .frame(width: width, height: Self.cell)
            .contentShape(Rectangle())
            .onTapGesture { onSelect(row.module.id) }
            .help(
                installed
                    ? "\(name) has \(row.module.id)\(isBehind ? ", behind on a commit that touched it" : "")"
                    : "\(name) does not have \(row.module.id)"
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                "\(name): \(installed ? (isBehind ? "installed, behind" : "installed") : "not installed")")
    }

    private func installedHelp(_ row: ModuleMatrix.Row, total: Int) -> String {
        "\(row.installedCount) of \(total) kit projects have \(row.module.id)"
    }

    private func behindHelp(_ row: ModuleMatrix.Row) -> String {
        row.behindCount == 0
            ? "No project is behind on a commit that touched \(row.module.id)"
            : "\(row.behindCount) of \(row.installedCount) projects are behind on a commit that touched \(row.module.id)"
    }
}
