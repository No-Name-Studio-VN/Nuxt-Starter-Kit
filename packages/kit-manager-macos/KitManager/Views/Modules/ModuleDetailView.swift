import KitManagerCore
import SwiftUI

/// A module's settings and the projects that use it.
struct ModuleDetailView: View {
    let row: ModuleMatrix.Row
    let projects: [Project]

    @Environment(AppModel.self) private var model

    private var title: String { row.module.title.isEmpty ? row.id : row.module.title }

    var body: some View {
        Form {
            Section {
                header
                if !row.module.requires.isEmpty {
                    LabeledContent("Requires") {
                        Text(row.module.requires.joined(separator: ", "))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
            Section("Projects Using This Module") {
                if row.installed.isEmpty {
                    Text("No projects use this module.").foregroundStyle(.secondary)
                } else {
                    ForEach(projects.filter { row.installed.contains($0.id) }) { project in
                        KitProjectLink(
                            row: ProjectRow(project: project, snapshot: model.snapshots[project.id]),
                            moduleID: row.id, isBehindOnModule: row.behind.contains(project.id))
                    }
                }
                HStack {
                    Spacer(minLength: 0)
                    Button("Show These Projects") {
                        model.moduleFilter = row.id
                        model.sidebar = .allProjects
                    }
                    .buttonStyle(.glass)
                    .disabled(row.installed.isEmpty)
                    .help("Filter All Projects to those using \(title)")
                }
            }
        }
        .formStyle(.grouped)
        .defaultScrollAnchor(.top)
        .navigationTitle(title)
    }

    private var header: some View {
        HStack(spacing: 14) {
            SettingsIcon(symbol: ModuleAppearance.symbol(for: row.id), color: ModuleAppearance.color(for: row.id), size: 56)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.title2.bold())
                    .accessibilityAddTraits(.isHeader)
                Text(row.id)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                if !row.module.description.isEmpty {
                    Text(row.module.description)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 6)
    }
}
