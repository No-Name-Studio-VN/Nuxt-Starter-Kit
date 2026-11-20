import KitManagerCore
import SwiftUI

/// Chooses the modules and folder name for a migration (spec 2.9), then copies the prompt or opens
/// Claude on it in Terminal.
struct MigrationFlowSheet: View {
    let project: Project
    let snapshot: ProjectSnapshot
    let catalogue: [KitModuleInfo]

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var folderName: String
    @State private var selection: Set<String>
    @State private var isWorking = false
    @State private var didCopy = false
    @State private var failure: PresentedError?

    init(project: Project, snapshot: ProjectSnapshot, catalogue: [KitModuleInfo]) {
        self.project = project
        self.snapshot = snapshot
        // Suggestions first, so they are visible without scrolling.
        let suggestions = Set(ModuleSuggester.suggest(dependencies: snapshot.package?.dependencies ?? [], catalogue: catalogue))
        let selectable = catalogue.filter { !$0.internal }
        self.catalogue = selectable.filter { suggestions.contains($0.id) } + selectable.filter { !suggestions.contains($0.id) }
        _folderName = State(
            initialValue: MigrationFolderName.defaultName(
                packageName: snapshot.package?.name, folderName: project.url.lastPathComponent))
        _selection = State(initialValue: suggestions)
    }

    private var folderProblem: String? { MigrationFolderName.problem(with: folderName) }

    private var suggested: Set<String> {
        Set(ModuleSuggester.suggest(dependencies: snapshot.package?.dependencies ?? [], catalogue: catalogue))
    }

    private var explanation: String {
        switch snapshot.kind {
        case .kitLegacy: "This project was made with kit 2.x. Moving onto the kit starts with a fresh project."
        case .nuxt: "This is a plain Nuxt app. Claude creates a fresh kit project and moves your code across."
        case .other, .kitV3, .missing, .invalidState:
            "Claude creates a fresh kit project and moves your code across."
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section {
                    Text(explanation)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    DisclosureGroup("How it works") {
                        Text(snapshot.kind == .kitLegacy ? PromptBuilder.legacyGuidance : "Claude does the work on a new kit-migration branch.")
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    TextField("Folder name", text: $folderName)
                        .disabled(isWorking)
                        .accessibilityLabel("Folder name")
                } header: {
                    Text("Move onto the Kit").accessibilityAddTraits(.isHeader)
                } footer: {
                    if let folderProblem {
                        Label(folderProblem, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(Color.red)
                    } else {
                        Text("The kit uses the folder name as the new project's name.")
                    }
                }
                if let failure {
                    Section {
                        FailureView(failure)
                    }
                }
                modules
            }
            .formStyle(.grouped)
            .disclosureGroupStyle(.row)
            .frame(height: catalogue.isEmpty ? 300 : 400)
            Divider()
            footer.padding(20)
        }
        .frame(width: 540)
        .interactiveDismissDisabled(isWorking)
    }

    private var modules: some View {
        Section("Modules") {
            if catalogue.isEmpty {
                Text("The module list loads once the nuxt-saas CLI is ready. You can still copy the prompt without modules.")
                    .foregroundStyle(.secondary)
            } else {
                Text("Suggestions from this project's dependencies are selected. You can change them below.")
                    .foregroundStyle(.secondary)
                ForEach(catalogue) { module in
                    Toggle(isOn: binding(for: module.id)) {
                        HStack(spacing: 10) {
                            SettingsIcon(symbol: ModuleAppearance.symbol(for: module.id), color: ModuleAppearance.color(for: module.id))
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(module.title).fontWeight(.medium)
                                    if suggested.contains(module.id) {
                                        Text("Suggested").font(.caption).foregroundStyle(Color.accentColor)
                                    }
                                }
                                if !module.description.isEmpty {
                                    Text(module.description).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                    .toggleStyle(.checkbox)
                    .disabled(isWorking)
                }
            }
        }
    }

    private func binding(for id: String) -> Binding<Bool> {
        Binding(
            get: { selection.contains(id) },
            set: { isOn in
                if isOn { selection.insert(id) } else { selection.remove(id) }
            })
    }

    private var footer: some View {
        HStack(spacing: 10) {
            Button("Cancel", role: .cancel) { dismiss() }
                .buttonStyle(.glass)
                .keyboardShortcut(.cancelAction)
                .disabled(isWorking)
            if didCopy {
                Label("Copied", systemImage: "checkmark").font(.caption).foregroundStyle(Color.green)
            }
            Spacer()
            Button {
                copy()
            } label: {
                Label("Copy prompt", systemImage: "doc.on.doc")
            }
            .buttonStyle(.glass)
            .disabled(folderProblem != nil || isWorking)
            Button {
                launch()
            } label: {
                Label("Move with Claude", systemImage: "sparkles")
            }
            .buttonStyle(.glassProminent)
            .keyboardShortcut(.defaultAction)
            .disabled(folderProblem != nil || isWorking)
        }
    }

    // MARK: Actions

    private func copy() {
        failure = nil
        do {
            try model.copyMigrationPrompt(project, folderName: folderName, selected: selection.sorted())
            didCopy = true
        } catch {
            didCopy = false
            failure = PresentedError(error)
        }
    }

    private func launch() {
        failure = nil
        didCopy = false
        isWorking = true
        Task {
            do {
                try await model.launchMigration(project, folderName: folderName, selected: selection.sorted())
                dismiss()
            } catch {
                failure = PresentedError(error)
            }
            isWorking = false
        }
    }
}
