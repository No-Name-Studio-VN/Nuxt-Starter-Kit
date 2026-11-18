import KitManagerCore
import SwiftUI

/// What migrating a non-kit project involves, with the buttons that start it.
struct MigrationSection: View {
    let project: Project
    let snapshot: ProjectSnapshot

    @Environment(AppModel.self) private var model
    @State private var didCopy = false
    @State private var failure: PresentedError?

    private var explanation: String {
        switch snapshot.kind {
        case .kitLegacy:
            PromptBuilder.legacyGuidance
        case .nuxt:
            "This is a plain Nuxt project that was not created from the kit. Migration generates a fresh kit project and ports this one across, on a new kit-migration branch."
        case .other:
            "This project was not created from the kit. Migration generates a fresh kit project and ports this one across, on a new kit-migration branch."
        case .kitV3, .missing, .invalidState:
            ""
        }
    }

    var body: some View {
        GlassCard("Migration") {
            VStack(alignment: .leading, spacing: 14) {
                Text(explanation)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 10) {
                    Button {
                        copyPrompt()
                    } label: {
                        Label(didCopy ? "Copied" : "Copy migration prompt", systemImage: didCopy ? "checkmark" : "doc.on.doc")
                    }
                    .buttonStyle(.glass)
                    Button {
                        model.flow = .migration(project)
                    } label: {
                        Label("Migrate with Claude…", systemImage: "sparkles")
                    }
                    .buttonStyle(.glassProminent)
                    .help("Choose the modules and folder name, then open Claude")
                }
                if let failure { FailureView(failure) }
            }
        }
    }

    /// Copies the prompt with the suggested modules and the default folder name.
    private func copyPrompt() {
        failure = nil
        let selected = ModuleSuggester.suggest(dependencies: snapshot.package?.dependencies ?? [], catalogue: model.catalogue)
        let folder = MigrationFolderName.defaultName(packageName: snapshot.package?.name, folderName: project.url.lastPathComponent)
        do {
            try model.copyMigrationPrompt(project, folderName: folder, selected: selected)
            didCopy = true
        } catch {
            didCopy = false
            failure = PresentedError(error)
        }
    }
}
