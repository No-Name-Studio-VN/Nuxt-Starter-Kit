import SwiftUI

struct DeclinedFeaturesSheet: View {
    let project: Project
    let titles: [String: String]

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var ids: [String]
    @State private var changing: String?
    @State private var error: PresentedError?

    init(project: Project, ids: [String], titles: [String: String]) {
        self.project = project
        self.titles = titles
        _ids = State(initialValue: ids)
    }

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section("Declined Features") {
                    if ids.isEmpty {
                        Text("No declined features.").foregroundStyle(.secondary)
                    } else {
                        ForEach(ids, id: \.self) { id in
                            LabeledContent {
                                Button("Ask Again") { askAgain(id) }
                                    .buttonStyle(.glass)
                                    .disabled(changing != nil || model.cliStatus != .ready)
                                    .accessibilityLabel("Ask again about \(titles[id] ?? id)")
                            } label: {
                                Text(titles[id] ?? id)
                            }
                        }
                    }
                    if let error { FailureView(error) }
                    if model.cliStatus != .ready {
                        Text("Build the nuxt-saas CLI to manage declined features.").foregroundStyle(.secondary)
                    }
                }
            }
            .formStyle(.grouped)
            .disclosureGroupStyle(.row)
            .frame(height: min(360, max(180, CGFloat(ids.count) * 45 + 70)))
            Divider()
            HStack {
                Spacer()
                if changing != nil { ProgressView().controlSize(.small) }
                Button("Done") { dismiss() }
                    .buttonStyle(.glassProminent)
                    .keyboardShortcut(.defaultAction)
                    .disabled(changing != nil)
            }
            .padding(20)
        }
        .frame(width: 460)
        .interactiveDismissDisabled(changing != nil)
    }

    private func askAgain(_ id: String) {
        changing = id
        error = nil
        Task {
            do {
                ids = try await model.askAboutFeatureAgain(project, id: id)
            } catch let failure {
                error = PresentedError(failure)
            }
            changing = nil
        }
    }
}
