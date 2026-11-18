import KitManagerCore
import SwiftUI

/// Shown above the table while the nuxt-saas CLI cannot run. It never builds silently.
struct CLIBanner: View {
    let status: CLIStatus

    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: needsBuild ? "hammer" : "exclamationmark.triangle")
                .foregroundStyle(Color.orange)
                .imageScale(.large)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(headline).font(.headline)
                Text(detail).font(.callout).foregroundStyle(.secondary)
                if let failure = model.buildFailure {
                    Text(failure)
                        .font(.caption)
                        .foregroundStyle(Color.red)
                        .lineLimit(8)
                        .textSelection(.enabled)
                }
            }
            Spacer(minLength: 12)
            if needsBuild {
                if model.isBuildingCLI {
                    ProgressView().controlSize(.small)
                    Text("Building…").foregroundStyle(.secondary)
                } else {
                    Button("Build CLI") { Task { await model.buildCLI() } }
                        .buttonStyle(.glassProminent)
                }
            } else {
                SettingsLink { Text("Open Settings") }
                    .buttonStyle(.glass)
            }
        }
        .padding(12)
        .accessibilityElement(children: .contain)
    }

    private var needsBuild: Bool {
        switch status {
        case .missingBuild, .staleBuild: true
        case .ready, .tooOld, .missingCheckout: false
        }
    }

    private var headline: String {
        switch status {
        case .missingBuild: "Build the nuxt-saas CLI"
        case .staleBuild: "The nuxt-saas CLI build is out of date"
        case .tooOld: "The kit checkout has an old CLI"
        case .missingCheckout: "Choose your kit checkout"
        case .ready: "CLI ready"
        }
    }

    private var detail: String {
        switch status {
        case .missingBuild:
            "Upgrade previews and the customisation score need the built CLI. This runs pnpm build in the kit checkout."
        case .staleBuild:
            "The sources are newer than the build, so previews would be out of date. Rebuild to refresh them."
        case .tooOld(let found):
            "Found CLI \(found), but \(NuxtSaasCLI.minimumVersion) or newer is required. Check out a newer kit branch, or pick another checkout in Settings."
        case .missingCheckout:
            "No packages/create-nuxt-saas folder was found at the configured path. Pick the Nuxt-Starter-Kit checkout in Settings."
        case .ready:
            ""
        }
    }
}
