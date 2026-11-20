import KitManagerCore
import SwiftUI

/// The build action shared by the CLI banner and Settings.
struct CLIBuildControl: View {
    @Environment(AppModel.self) private var model

    static func isAvailable(for status: CLIStatus) -> Bool {
        switch status {
        case .missingBuild, .staleBuild: true
        case .ready, .tooOld, .missingCheckout: false
        }
    }

    var body: some View {
        // One button for both states, so the glass capsule stays put while the build runs.
        Button {
            Task { await model.buildCLI() }
        } label: {
            if model.isBuildingCLI {
                HStack(spacing: 6) {
                    ProgressView().controlSize(.mini)
                    Text("Building…")
                }
            } else {
                Text("Build CLI")
            }
        }
        .buttonStyle(.glass)
        .disabled(model.isBuildingCLI)
        .help("Run pnpm build in the kit folder")
    }
}
