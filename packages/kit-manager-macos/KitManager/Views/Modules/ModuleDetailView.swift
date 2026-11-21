import KitManagerCore
import SwiftUI

/// A module's settings and the projects that use it.
struct ModuleDetailView: View {
    let row: ModuleMatrix.Row
    let projects: [Project]
    let onOpenModule: (String) -> Void

    @Environment(AppModel.self) private var model

    private var title: String { row.module.title.isEmpty ? row.id : row.module.title }

    var body: some View {
        Form {
            Section {
                header
            }
            relatedModules("Requires", ids: row.module.requires)
            relatedModules("Requires one of", ids: row.module.requiresOneOf)
            relatedModules("Required by", ids: modulesRequiring(row.id, in: model.catalogue).map(\.id))
            if !row.module.bindings.isEmpty || !row.module.env.isEmpty {
                Section("Runtime Configuration") {
                    valuesRow("Bindings", values: row.module.bindings)
                    valuesRow("Env keys", values: row.module.env)
                }
            }
            if !row.module.dependencies.isEmpty || !row.module.devDependencies.isEmpty {
                Section("npm Dependencies") {
                    valuesRow("Dependencies", values: row.module.dependencies)
                    valuesRow("Dev dependencies", values: row.module.devDependencies)
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

    @ViewBuilder
    private func relatedModules(_ heading: LocalizedStringKey, ids: [String]) -> some View {
        if !ids.isEmpty {
            Section(heading) {
                ForEach(ids, id: \.self) { id in
                    moduleLink(id)
                }
            }
        }
    }

    private func moduleLink(_ id: String) -> some View {
        let module = model.catalogue.first { $0.id == id }
        let title = (module?.title).flatMap { $0.isEmpty ? nil : $0 } ?? id
        return Button {
            onOpenModule(id)
        } label: {
            HStack(spacing: 10) {
                SettingsIcon(symbol: ModuleAppearance.symbol(for: id), color: ModuleAppearance.color(for: id))
                    .accessibilityHidden(true)
                Text(title)
                Spacer(minLength: 8)
                if module != nil {
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                }
            }
            .padding(.vertical, 2)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(module == nil)
        .help(module == nil ? "\(id) is not in the kit's module list" : "Show \(title)")
        .accessibilityHint(module == nil ? "This module is not in the kit's module list" : "Shows the module details")
    }

    @ViewBuilder
    private func valuesRow(_ label: LocalizedStringKey, values: [String]) -> some View {
        if !values.isEmpty {
            LabeledContent(label) {
                Text(values.joined(separator: "\n"))
                    .monospaced()
                    .multilineTextAlignment(.trailing)
                    .fixedSize(horizontal: false, vertical: true)
                    .textSelection(.enabled)
            }
        }
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
