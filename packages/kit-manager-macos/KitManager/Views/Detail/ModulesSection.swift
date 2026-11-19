import KitManagerCore
import SwiftUI

/// Installed modules and the entry point to the module change sheet.
struct ModulesSection: View {
    let project: Project
    let snapshot: ProjectSnapshot

    @Environment(AppModel.self) private var model
    @State private var isManaging = false
    @State private var initialRemoval: String?

    private var installed: [ModuleChoice] {
        let catalogue = Dictionary(model.catalogue.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return (snapshot.kitState?.modules ?? []).map { ModuleChoice(id: $0, info: catalogue[$0]) }
    }

    private var available: [ModuleChoice] {
        let installedIDs = Set(snapshot.kitState?.modules ?? [])
        return model.catalogue
            .filter { !$0.internal && !installedIDs.contains($0.id) }
            .map { ModuleChoice(id: $0.id, info: $0) }
    }

    private var removable: [ModuleChoice] {
        installed.filter { $0.info?.internal != true }
    }

    private var canChange: Bool { model.cliStatus == .ready }

    var body: some View {
        Section {
            if installed.isEmpty {
                Text("No optional modules installed.").foregroundStyle(.secondary)
            } else {
                ForEach(groupModules(installed, module: \.info)) { group in
                    if let name = group.name {
                        Text(name)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .accessibilityAddTraits(.isHeader)
                    }
                    ForEach(group.entries) { entry in
                        row(entry.item, depth: entry.depth)
                    }
                }
            }
            HStack {
                Spacer()
                Button("Add or Remove Modules…") { manageModules() }
                    .buttonStyle(.glass)
                    .disabled(!canChange || (available.isEmpty && removable.isEmpty))
                    .help(canChange ? "Add modules or remove installed modules" : "Build the nuxt-saas CLI first")
            }
            .sheet(isPresented: $isManaging) {
                ModuleChangeSheet(project: project, additions: available, removals: removable, initialRemoval: initialRemoval)
            }
            #if DEBUG
            .task {
                if DebugLaunchOptions.sheet == "modules", model.selectedProjectID == project.id,
                    canChange, !available.isEmpty || !removable.isEmpty
                {
                    // Let the detail form settle before asking it to present a sheet.
                    try? await Task.sleep(for: .milliseconds(250))
                    if !Task.isCancelled { manageModules() }
                }
            }
            #endif
        } header: {
            Text("Modules")
        } footer: {
            VStack(alignment: .leading, spacing: 4) {
                if let dirty = snapshot.git?.dirtyCount, dirty > 0 {
                    Label {
                        Text("\(dirty) unsaved \(dirty == 1 ? "change" : "changes"). You can preview a module change, but must commit or stash your changes before applying it.")
                    } icon: {
                        Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.orange)
                    }
                    .font(.callout)
                }
                if model.catalogue.isEmpty {
                    Text("Module descriptions and available modules load once the nuxt-saas CLI is ready.")
                } else {
                    Text("\(available.count) more available")
                }
            }
        }
    }

    private func row(_ choice: ModuleChoice, depth: Int) -> some View {
        let id = choice.id
        let title = choice.title
        let isRemovable = choice.info?.internal != true
        return HStack(spacing: 10) {
            SettingsIcon(symbol: ModuleAppearance.symbol(for: id), color: ModuleAppearance.color(for: id))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                if !choice.detail.isEmpty {
                    Text(choice.detail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(.leading, CGFloat(depth) * 16)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .contextMenu {
            if isRemovable {
                Button("Remove \(title)") { manageModules(removing: id) }
                    .disabled(!canChange)
                    .help("Remove \(title)")
            }
        }
        .accessibilityActions {
            if canChange && isRemovable {
                Button("Remove \(title)") { manageModules(removing: id) }
            }
        }
    }

    private func manageModules(removing id: String? = nil) {
        initialRemoval = id
        isManaging = true
    }
}
