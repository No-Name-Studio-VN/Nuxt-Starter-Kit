import KitManagerCore
import SwiftUI

/// First-run setup and ways to add projects when the list is empty.
struct WelcomeView: View {
    let isScanning: Bool
    @Binding var importRequest: ImportRequest?

    @Environment(AppModel.self) private var model
    @AppStorage(AppSettings.kitPathKey) private var kitPath = ""

    var body: some View {
        Form {
            VStack(spacing: 8) {
                SettingsIcon(symbol: "shippingbox.fill", color: .accentColor, size: 64)
                    .accessibilityHidden(true)
                Text("Welcome to Kit Manager")
                    .font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)
                Text("Add the projects you want to keep up to date with the kit.")
                    .foregroundStyle(.secondary)
            }
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .listRowBackground(Color.clear)

            Section {
                LabeledContent {
                    SettingsLink { Text("Change…") }
                        .buttonStyle(.glass)
                        .accessibilityLabel("Change kit folder")
                } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Kit folder")
                        Text(kitPath.isEmpty ? "—" : (kitPath as NSString).abbreviatingWithTildeInPath)
                            .font(.callout)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .help(kitPath)
                        kitStatus
                            .font(.caption)
                    }
                }
            }

            Section {
                HStack {
                    Spacer(minLength: 0)
                    Button("New Project…", action: model.beginProjectCreation)
                        .buttonStyle(.glassProminent)
                    Button("Add Existing Project…") { importRequest = .add }
                        .buttonStyle(.glass)
                    Button("Scan Folder…") { importRequest = .scan }
                        .buttonStyle(.glass)
                        .help("Find projects inside a folder")
                        .disabled(isScanning)
                    if isScanning {
                        ProgressView().controlSize(.small)
                            .accessibilityLabel("Scanning for projects")
                    }
                }
            } footer: {
                Text("Kit Manager only reads your projects. Nothing changes until you click an action.")
            }
        }
        .formStyle(.grouped)
        .frame(maxWidth: 600)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .navigationTitle("Kit Manager")
    }

    @ViewBuilder
    private var kitStatus: some View {
        switch model.cliStatus {
        case .ready:
            Label(model.cliStatus.setupMessage, systemImage: "checkmark.circle.fill").foregroundStyle(Color.green)
        case .missingBuild, .staleBuild:
            Label(model.cliStatus.setupMessage, systemImage: "hammer").foregroundStyle(.secondary)
        case .tooOld, .missingCheckout:
            Label(model.cliStatus.setupMessage, systemImage: "exclamationmark.circle").foregroundStyle(.secondary)
        }
    }
}
