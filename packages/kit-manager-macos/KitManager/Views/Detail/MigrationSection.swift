import KitManagerCore
import SwiftUI

/// Explains what moving a project onto the kit involves and starts the existing flow.
struct MigrationSection: View {
    let project: Project
    let snapshot: ProjectSnapshot

    @Environment(AppModel.self) private var model
    @State private var didCopy = false
    @State private var failure: PresentedError?

    private var explanation: String {
        switch snapshot.kind {
        case .kitLegacy:
            "This project was made with kit 2.x. To move onto the current kit, create a fresh kit project with `npm create nuxt-saas@latest` and move your code across."
        case .nuxt:
            "This is a plain Nuxt app. Claude creates a fresh kit project and moves your code across on a new kit-migration branch."
        case .other:
            "There's no Nuxt app in this folder to move onto the kit. You can still start a fresh kit project if you want to adapt this project."
        case .kitV3, .missing, .invalidState:
            ""
        }
    }

    var body: some View {
        Section("Move onto the Kit") {
            VStack(alignment: .leading, spacing: 4) {
                if case .other = snapshot.kind {
                    Text("Not a Nuxt project")
                }
                Text(explanation)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) { actions }
                VStack(alignment: .trailing, spacing: 8) { actions }
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
            if let failure { FailureView(failure) }
        }
    }

    @ViewBuilder
    private var actions: some View {
        Button {
            copyPrompt()
        } label: {
            Label(didCopy ? "Copied" : "Copy migration prompt", systemImage: didCopy ? "checkmark" : "doc.on.doc")
        }
        .buttonStyle(.glass)
        .fixedSize()
        Button("Move with Claude…", systemImage: "sparkles") {
            model.flow = .migration(project)
        }
        .buttonStyle(.glassProminent)
        .fixedSize()
        .help("Choose the modules and folder name, then open Claude")
    }

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
