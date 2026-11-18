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
        if model.isBuildingCLI {
            HStack(spacing: 6) {
                ProgressView().controlSize(.small)
                Text("Building…").foregroundStyle(.secondary)
            }
        } else {
            Button("Build CLI") { Task { await model.buildCLI() } }
                .buttonStyle(.glass)
                .help("Run pnpm build in the kit folder")
        }
    }
}
