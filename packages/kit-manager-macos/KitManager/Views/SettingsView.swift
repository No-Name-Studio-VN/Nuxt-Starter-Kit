import KitManagerCore
import SwiftUI

struct SettingsView: View {
    @AppStorage(AppSettings.kitPathKey) private var kitPath = ""
    @AppStorage(AppSettings.fetchIntervalKey) private var fetchInterval = AppSettings.defaultFetchIntervalMinutes

    @Environment(AppModel.self) private var model
    @State private var isChoosing = false
    @State private var appliedPath: String?

    var body: some View {
        Form {
            Section {
                LabeledContent("Kit checkout") {
                    HStack {
                        TextField("Kit checkout", text: $kitPath, prompt: Text("Path to Nuxt-Starter-Kit"))
                            .labelsHidden()
                            .textFieldStyle(.roundedBorder)
                            .onSubmit { apply() }
                        Button("Choose…") { isChoosing = true }
                    }
                }
                validation
            } header: {
                Text("KIT")
            } footer: {
                Text("Upgrade previews, version labels and the module list all come from this checkout.")
            }

            Section {
                Picker("Fetch the kit every", selection: $fetchInterval) {
                    ForEach(AppSettings.fetchIntervalChoices, id: \.self) { minutes in
                        Text(label(forMinutes: minutes)).tag(minutes)
                    }
                }
            } header: {
                Text("REFRESH")
            }
        }
        .formStyle(.grouped)
        .frame(width: 520)
        .fixedSize(horizontal: false, vertical: true)
        .fileImporter(isPresented: $isChoosing, allowedContentTypes: [.folder]) { result in
            if case .success(let url) = result {
                kitPath = url.standardizedFileURL.path
                apply()
            }
        }
        .onChange(of: fetchInterval) { model.restartFetchTimer() }
        .onAppear { appliedPath = kitPath }
        .onDisappear { apply() }
    }

    private var validation: some View {
        let result = describe(model.cliStatus)
        return Label(result.text, systemImage: result.symbol)
            .foregroundStyle(result.color)
            .accessibilityElement(children: .combine)
    }

    private func describe(_ status: CLIStatus) -> (text: String, symbol: String, color: Color) {
        switch status {
        case .ready:
            ("The nuxt-saas CLI is built and ready.", "checkmark.circle.fill", Color.green)
        case .missingBuild, .staleBuild, .tooOld, .missingCheckout:
            (
                CLIFailure.unavailable(status).errorDescription ?? "The CLI cannot run.",
                "exclamationmark.triangle.fill", Color.orange
            )
        }
    }

    /// Applies a changed path once, instead of on every keystroke.
    private func apply() {
        guard let appliedPath, kitPath != appliedPath else { return }
        self.appliedPath = kitPath
        Task { await model.reconfigure() }
    }

    private func label(forMinutes minutes: Int) -> String {
        minutes >= 60 ? "\(minutes / 60) hour\(minutes >= 120 ? "s" : "")" : "\(minutes) minutes"
    }
}
