import KitManagerCore
import SwiftUI

struct SettingsView: View {
    @AppStorage(AppSettings.kitPathKey) private var kitPath = ""
    @AppStorage(AppSettings.fetchIntervalKey) private var fetchInterval = AppSettings.defaultFetchIntervalMinutes

    @Environment(AppModel.self) private var model
    @State private var isChoosing = false
    @State private var appliedPath: String?
    @State private var pendingPathChanges = 0

    var body: some View {
        Form {
            Section {
                HStack(spacing: 8) {
                    TextField("Kit folder", text: $kitPath, prompt: Text("Path to Nuxt-Starter-Kit"))
                        .labelsHidden()
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { apply() }
                        .accessibilityLabel("Kit folder path")
                    Button("Choose…") { isChoosing = true }
                        .buttonStyle(.glass)
                }
                HStack(spacing: 8) {
                    validation
                    if CLIBuildControl.isAvailable(for: model.cliStatus) {
                        Spacer(minLength: 0)
                        CLIBuildControl()
                            .fixedSize()
                            .disabled(kitPath != appliedPath || pendingPathChanges > 0)
                    }
                }
                if let failure = model.buildFailure, CLIBuildControl.isAvailable(for: model.cliStatus) {
                    FailureView(message: failure)
                }
            } header: {
                Text("Kit Folder")
            } footer: {
                Text("Update previews, version labels and the module list come from this folder.")
            }

            Section("Updates") {
                Picker("Fetch the kit every", selection: $fetchInterval) {
                    ForEach(AppSettings.fetchIntervalChoices, id: \.self) { minutes in
                        Text(label(forMinutes: minutes)).tag(minutes)
                    }
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
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
        let isReady = model.cliStatus == .ready
        return Label(model.cliStatus.setupMessage, systemImage: isReady ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
            .foregroundStyle(isReady ? Color.green : .orange)
            .accessibilityElement(children: .combine)
            .help(CLIFailure.unavailable(model.cliStatus).errorDescription ?? model.cliStatus.setupMessage)
    }

    /// Applies a changed path once, instead of on every keystroke.
    private func apply() {
        guard let appliedPath, kitPath != appliedPath else { return }
        self.appliedPath = kitPath
        pendingPathChanges += 1
        Task {
            await model.reconfigure()
            pendingPathChanges -= 1
        }
    }

    private func label(forMinutes minutes: Int) -> String {
        minutes >= 60 ? "\(minutes / 60) hour\(minutes >= 120 ? "s" : "")" : "\(minutes) minutes"
    }
}
