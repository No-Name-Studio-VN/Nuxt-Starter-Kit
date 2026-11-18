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
        case .kitLegacy: PromptBuilder.legacyGuidance
        case .nuxt: "A plain Nuxt project. Claude generates a fresh kit project and ports this one across, on a new kit-migration branch."
        case .other, .kitV3, .missing, .invalidState:
            "Claude generates a fresh kit project and ports this one across, on a new kit-migration branch."
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Migrate with Claude").font(.title2.weight(.semibold)).accessibilityAddTraits(.isHeader)
            Text(explanation)
                .font(.callout)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            folderField
            Divider().overlay(Theme.hairline)
            modules
            if let failure { FailureView(failure) }
            footer
        }
        .padding(20)
        .frame(width: 540)
        .background(Theme.canvas)
        .interactiveDismissDisabled(isWorking)
    }

    // MARK: Pieces

    private var folderField: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Folder name").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            TextField("Folder name", text: $folderName)
                .textFieldStyle(.roundedBorder)
                .labelsHidden()
                .disabled(isWorking)
                .accessibilityLabel("Folder name")
            if let folderProblem {
                Label(folderProblem, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(Theme.red)
            } else {
                Text("The generated project must carry this name. The kit records it as the project's name.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var modules: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Modules").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            if catalogue.isEmpty {
                Text("The module list loads once the nuxt-saas CLI is ready. You can still copy the prompt without modules.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                Text("Pre-checked from this project's dependencies. Change them before generating.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ScrollView {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(catalogue) { module in
                            Toggle(isOn: binding(for: module.id)) {
                                VStack(alignment: .leading, spacing: 1) {
                                    HStack(spacing: 6) {
                                        Text(module.title).font(.callout.weight(.medium))
                                        if suggested.contains(module.id) {
                                            Text("suggested").font(.caption2).foregroundStyle(Theme.amber)
                                        }
                                    }
                                    if !module.description.isEmpty {
                                        Text(module.description).font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                            .toggleStyle(.checkbox)
                            .disabled(isWorking)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 220)
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
            if didCopy {
                Label("Copied", systemImage: "checkmark").font(.caption).foregroundStyle(Theme.green)
            }
            Spacer()
            Button("Cancel", role: .cancel) { dismiss() }
                .buttonStyle(.glass)
                .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
                .keyboardShortcut(.cancelAction)
                .disabled(isWorking)
            Button {
                copy()
            } label: {
                Label("Copy prompt", systemImage: "doc.on.doc")
            }
            .buttonStyle(.glass)
            .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
            .disabled(folderProblem != nil || isWorking)
            Button {
                launch()
            } label: {
                Label("Migrate with Claude", systemImage: "sparkles")
            }
            .buttonStyle(.glassProminent)
            .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
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
