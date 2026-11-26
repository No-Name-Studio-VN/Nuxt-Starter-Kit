import KitManagerCore
import SwiftUI
import UniformTypeIdentifiers

struct NewProjectSheet: View {
    let onCreated: (URL) -> Bool

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var parent: URL?
    @State private var folderName = ""
    @State private var selection: Set<String> = []
    @State private var moduleSearch = ""
    @State private var isChoosingParent = false
    @State private var isCreating = false
    @State private var source: Source?
    @State private var loadAttempt = 0
    @State private var loadFailure: PresentedError?
    @State private var failure: PresentedError?
    @State private var completionNotice: String?

    private struct Source {
        let cli: NuxtSaasCLI
        let commit: String
        let report: ModulesReport
    }

    private var moduleSelection: CreateModuleSelection? {
        source.map { CreateModuleSelection(report: $0.report, explicit: selection) }
    }

    private var canCreate: Bool {
        !isCreating && !isChoosingParent && destination != nil && moduleSelection?.missingAlternatives.isEmpty == true
    }

    private var folderProblem: String? { MigrationFolderName.problem(with: folderName) }

    private var destination: URL? {
        guard folderProblem == nil else { return nil }
        let name = folderName.trimmingCharacters(in: .whitespacesAndNewlines)
        return parent?.appending(path: name, directoryHint: .isDirectory)
    }

    var body: some View {
        VStack(spacing: 0) {
            if let completionNotice {
                ContentUnavailableView {
                    Label("Project Created", systemImage: "checkmark.circle")
                } description: {
                    Text(completionNotice)
                }
                .frame(height: 200)
            } else {
                Form {
                    locationSection
                        .disabled(isCreating)
                    modulesSection
                        .disabled(isCreating)
                }
                .formStyle(.grouped)
                .frame(height: 420)
            }
            Divider()
            VStack(alignment: .leading, spacing: 12) {
                if completionNotice == nil, let failure {
                    FailureView(failure)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                if let source, let moduleSelection {
                    ForEach(moduleSelection.missingAlternatives) { module in
                        alternativeChoice(for: module, in: source.report)
                    }
                }
                footer
            }
            .padding(20)
        }
        .frame(width: 540)
        .interactiveDismissDisabled(isCreating)
        .fileImporter(isPresented: $isChoosingParent, allowedContentTypes: [.folder]) { result in
            switch result {
            case .success(let folder):
                parent = folder
                failure = nil
            case .failure(let error):
                let nsError = error as NSError
                if nsError.domain != NSCocoaErrorDomain || nsError.code != NSUserCancelledError {
                    failure = PresentedError(error)
                }
            }
        }
        .task(id: loadAttempt) { await loadSource() }
    }

    private var locationSection: some View {
        Section {
            TextField("Folder name", text: $folderName, prompt: Text("my-nuxt-app"))
            LabeledContent {
                Button(parent == nil ? "Choose…" : "Change…") { isChoosingParent = true }
                    .buttonStyle(.glass)
                    .accessibilityLabel("Choose parent folder")
            } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Parent folder")
                    if let parent {
                        Text(parent.path)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .help(parent.path)
                    }
                }
            }
            if let destination {
                LabeledContent("Destination") {
                    Text(destination.path)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
            }
        } header: {
            Text("New Project").accessibilityAddTraits(.isHeader)
        } footer: {
            if let folderProblem, !folderName.isEmpty {
                Label(folderProblem, systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(Color.red)
            } else {
                Text("The kit uses the folder name to derive the package name.")
            }
        }
    }

    private var modulesSection: some View {
        Section("Modules") {
            if let source, let moduleSelection {
                Text("From local kit main (\(source.commit.prefix(7))). Default and required modules are included automatically.")
                    .foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                    TextField("Search modules", text: $moduleSearch, prompt: Text("Search modules"))
                        .labelsHidden()
                        .textFieldStyle(.plain)
                    if !moduleSearch.isEmpty {
                        Button { moduleSearch = "" } label: {
                            Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Clear module search")
                        .help("Clear module search")
                    }
                }
                ModuleSelectionPicker(
                    choices: source.report.modules.map { ModuleChoice(id: $0.id, info: $0) },
                    selection: $selection, projection: moduleSelection, searchText: moduleSearch,
                    ungroupedTitle: source.report.groups.isEmpty ? nil : "Ungrouped")
            } else if let loadFailure {
                FailureView(loadFailure)
                HStack {
                    SettingsLink { Text("Open Settings") }
                    Button("Try Again") { loadAttempt += 1 }
                }
            } else {
                ProgressView("Reading modules from the local kit…")
                    .controlSize(.small)
            }
        }
    }

    private func alternativeChoice(for module: KitModuleInfo, in report: ModulesReport) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("\(module.title) needs one of these modules:", systemImage: "exclamationmark.circle")
                .font(.callout)
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) { alternativeButtons(for: module, in: report) }
                VStack(alignment: .leading, spacing: 6) { alternativeButtons(for: module, in: report) }
            }
        }
    }

    private func alternativeButtons(for module: KitModuleInfo, in report: ModulesReport) -> some View {
        ForEach(module.requiresOneOf, id: \.self) { id in
            let title = report.modules.first { $0.id == id }?.title ?? id
            Button("Select \(title)") { selection.insert(id) }
                .buttonStyle(.glass)
        }
    }

    private var footer: some View {
        HStack(spacing: 10) {
            if completionNotice != nil {
                Spacer()
                Button("Done") { dismiss() }
                    .buttonStyle(.glassProminent)
                    .keyboardShortcut(.defaultAction)
            } else {
                Button("Cancel", role: .cancel) { dismiss() }
                    .buttonStyle(.glass)
                    .keyboardShortcut(.cancelAction)
                    .disabled(isCreating)
                Spacer()
                if isCreating {
                    ProgressView("Creating project…").controlSize(.small)
                } else {
                    Text("No dependencies are installed.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Button("Create Project", action: create)
                    .buttonStyle(.glassProminent)
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canCreate)
            }
        }
    }

    private func loadSource() async {
        loadFailure = nil
        do {
            let cli = model.cli
            let status = cli.status()
            guard status == .ready else { throw CLIFailure.unavailable(status) }
            let commit = try await model.kit.latestMain()
            let report = try await model.limiter.run { try await cli.modules(at: commit) }
            guard !Task.isCancelled else { return }
            source = Source(cli: cli, commit: commit, report: report)
        } catch let error as GitError {
            guard !Task.isCancelled else { return }
            loadFailure = PresentedError(message: "The configured kit has no readable origin/main. Check the kit folder in Settings, or fetch the kit and try again.\n\(error.localizedDescription)")
        } catch {
            guard !Task.isCancelled else { return }
            loadFailure = PresentedError(error)
        }
    }

    private func create() {
        guard canCreate, completionNotice == nil, let parent, let source, let destination else { return }
        failure = nil
        isCreating = true
        let modules = selection.sorted()
        Task {
            let hasAccess = parent.startAccessingSecurityScopedResource()
            defer {
                if hasAccess { parent.stopAccessingSecurityScopedResource() }
                isCreating = false
            }
            do {
                let report = try await source.cli.initialize(project: destination, modules: modules, at: source.commit)
                if !onCreated(URL(filePath: report.target)) {
                    completionNotice = "The files were created at \(report.target), but the project couldn’t be added to the list. Use Add Existing Project to register it."
                    return
                }
                switch report.git {
                case .committed:
                    dismiss()
                case .initialised:
                    completionNotice = "The project was added and Git was initialized, but Git could not create the first commit. Check your Git name and email before committing."
                case .skipped:
                    completionNotice = "The project was added. Git did not create a separate repository because the folder is already inside a Git working tree."
                }
            } catch {
                failure = PresentedError(error)
            }
        }
    }
}
