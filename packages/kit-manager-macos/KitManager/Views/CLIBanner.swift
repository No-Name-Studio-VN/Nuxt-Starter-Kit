import KitManagerCore
import SwiftUI

/// Explains why the nuxt-saas CLI cannot run and offers the next action. It never builds silently.
struct CLIBanner: View {
    let status: CLIStatus

    @Environment(AppModel.self) private var model

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) {
                message.frame(idealWidth: 320, alignment: .leading)
                Spacer(minLength: 0)
                action.fixedSize()
            }
            VStack(alignment: .leading, spacing: 8) {
                message
                action.frame(maxWidth: .infinity, alignment: .trailing)
            }
        }
        .padding(12)
        .background(.fill.quaternary, in: .rect(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .contain)
    }

    private var message: some View {
        HStack(alignment: .top, spacing: 12) {
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
        }
    }

    @ViewBuilder
    private var action: some View {
        if needsBuild {
            CLIBuildControl()
        } else {
            SettingsLink { Text("Open Settings") }
                .buttonStyle(.glass)
        }
    }

    private var needsBuild: Bool { CLIBuildControl.isAvailable(for: status) }

    private var headline: String {
        switch status {
        case .missingBuild: "Build the nuxt-saas CLI"
        case .staleBuild: "The nuxt-saas CLI build is out of date"
        case .tooOld: "The kit folder has an old CLI"
        case .missingCheckout: "Choose your kit folder"
        case .ready: "CLI ready"
        }
    }

    private var detail: String {
        switch status {
        case .missingBuild:
            "Build the CLI to preview updates and see which kit files you've edited."
        case .staleBuild:
            "The sources are newer than the build, so previews would be out of date. Rebuild to refresh them."
        case .tooOld(let found):
            "Found CLI \(found), but \(NuxtSaasCLI.minimumVersion) or newer is required. Update the kit or choose a newer kit folder in Settings."
        case .missingCheckout:
            "The selected folder doesn't contain the kit CLI. Choose the Nuxt-Starter-Kit folder in Settings."
        case .ready:
            ""
        }
    }
}
