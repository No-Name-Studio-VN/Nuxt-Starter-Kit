import KitManagerCore
import SwiftUI

/// What migrating a non-kit project involves. The buttons are wired in the next step.
struct MigrationSection: View {
    let snapshot: ProjectSnapshot

    private var explanation: String {
        switch snapshot.kind {
        case .kitLegacy:
            PromptBuilder.legacyGuidance
        case .nuxt:
            "This is a plain Nuxt project that was not created from the kit. Migration generates a fresh kit project and ports this one across, on a new kit-migration branch."
        case .kitV3, .other, .missing, .invalidState:
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
                    } label: {
                        Label("Copy migration prompt", systemImage: "doc.on.doc")
                    }
                    .buttonStyle(.glass)
                    .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
                    .disabled(true)
                    Button {
                    } label: {
                        Label("Migrate with Claude", systemImage: "sparkles")
                    }
                    .buttonStyle(.glassProminent)
                    .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
                    .disabled(true)
                    Text("Available in the next step")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}
