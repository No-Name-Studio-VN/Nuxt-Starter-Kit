import KitManagerCore
import SwiftUI

/// Git, env and deployment at a glance. `.env` values are never read here: only key names.
struct HealthSection: View {
    let project: Project
    let snapshot: ProjectSnapshot

    @Environment(AppModel.self) private var model
    @State private var draftURL = ""
    @State private var urlError: String?
    @State private var isChecking = false

    private static let envKeyLimit = 8

    var body: some View {
        GlassCard("Health") {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .top, spacing: 24) {
                    column("Git") { git }
                    column("Env") { env }
                    column("Deployment") { deployment }
                }
                VStack(alignment: .leading, spacing: 20) {
                    column("Git") { git }
                    column("Env") { env }
                    column("Deployment") { deployment }
                }
            }
        }
        .onAppear { draftURL = project.productionURL ?? "" }
    }

    private func column<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.callout.weight(.semibold))
            content()
        }
        .frame(minWidth: 220, maxWidth: .infinity, alignment: .topLeading)
    }

    // MARK: Git

    @ViewBuilder
    private var git: some View {
        if let git = snapshot.git {
            DetailRow("Branch") {
                Text(git.branch ?? "detached").font(.callout.monospaced()).lineLimit(1).truncationMode(.middle)
            }
            DetailRow("Changes") {
                if git.dirtyCount == 0 {
                    Text("Clean")
                } else {
                    Label("\(git.dirtyCount) uncommitted", systemImage: "circle.fill")
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(Theme.amber, Color.primary)
                }
            }
            DetailRow("Upstream") {
                if let ahead = git.ahead, let behind = git.behind {
                    Text("↑\(ahead) ahead · ↓\(behind) behind").monospacedDigit()
                } else {
                    Text("No upstream").foregroundStyle(.secondary)
                }
            }
            DetailRow("Last commit") {
                if let date = git.lastCommitDate {
                    Text(date.formatted(.relative(presentation: .named)))
                } else {
                    Text("—").foregroundStyle(.secondary)
                }
            }
        } else {
            Text("Not a git repository").font(.callout).foregroundStyle(.secondary)
        }
    }

    // MARK: Env

    @ViewBuilder
    private var env: some View {
        if let env = snapshot.env {
            if !env.hasExample {
                Text("No .env.example to compare against").font(.callout).foregroundStyle(.secondary)
            } else if !env.hasEnv {
                Label("No .env file", systemImage: "exclamationmark.circle")
                    .font(.callout)
                    .foregroundStyle(Theme.amber)
            } else if env.missing.isEmpty {
                Label("All keys defined", systemImage: "checkmark.circle.fill")
                    .font(.callout)
                    .foregroundStyle(Theme.green)
            } else {
                Label("\(env.missing.count) missing", systemImage: "exclamationmark.circle")
                    .font(.callout)
                    .foregroundStyle(Theme.amber)
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(env.missing.prefix(Self.envKeyLimit), id: \.self) { key in
                        Text(key).font(.caption.monospaced()).lineLimit(1).truncationMode(.middle)
                    }
                    if env.missing.count > Self.envKeyLimit {
                        Text("+\(env.missing.count - Self.envKeyLimit) more").font(.caption).foregroundStyle(.secondary)
                    }
                }
                .textSelection(.enabled)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Missing keys: \(env.missing.joined(separator: ", "))")
            }
        } else {
            Text("—").foregroundStyle(.secondary)
        }
    }

    // MARK: Deployment

    private var resolvedURL: URL? {
        ProductionURL.resolve(wrangler: snapshot.wrangler, override: project.productionURL)
    }

    @ViewBuilder
    private var deployment: some View {
        if let name = snapshot.wrangler?.workerName {
            DetailRow("Worker") { Text(name).font(.callout.monospaced()).lineLimit(1).truncationMode(.middle) }
        } else if snapshot.wrangler == nil {
            Text("No wrangler.jsonc").font(.callout).foregroundStyle(.secondary)
        }
        if let url = resolvedURL {
            DetailRow("URL") {
                Text(url.absoluteString)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .textSelection(.enabled)
            }
            DetailRow("Status") { status }
            Button {
                isChecking = true
                Task {
                    await model.checkHealth(project)
                    isChecking = false
                }
            } label: {
                Label("Check now", systemImage: "arrow.clockwise")
            }
            .quietGlassButton()
            .disabled(isChecking)
        }
        urlOverride
    }

    @ViewBuilder
    private var status: some View {
        if isChecking {
            HStack(spacing: 6) {
                ProgressView().controlSize(.mini)
                Text("Checking…").foregroundStyle(.secondary)
            }
        } else if let health = snapshot.health {
            if let code = health.statusCode {
                HStack(spacing: 6) {
                    Circle().fill(health.isUp ? Theme.green : Theme.red).frame(width: 7, height: 7)
                    Text("\(code)").monospacedDigit()
                    if let latency = health.latency {
                        Text("· \(Self.milliseconds(latency)) ms").monospacedDigit().foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("\(health.isUp ? "Up" : "Down"), status \(code)")
            } else {
                Label(health.error ?? "Unreachable", systemImage: "wifi.exclamationmark")
                    .foregroundStyle(Theme.red)
                    .lineLimit(2)
            }
        } else {
            ProgressView().controlSize(.mini)
        }
    }

    private var urlOverride: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(snapshot.wrangler?.productionURL == nil ? "Production URL" : "Production URL override")
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack(spacing: 6) {
                TextField(
                    "Production URL", text: $draftURL,
                    prompt: Text(verbatim: "https://example.com").foregroundStyle(.secondary)
                )
                .textFieldStyle(.roundedBorder)
                    .controlSize(.small)
                    .autocorrectionDisabled()
                    .onSubmit(saveURL)
                    .onChange(of: draftURL) { urlError = nil }
                Button("Save", action: saveURL)
                    .quietGlassButton()
                    .disabled(draftURL.trimmingCharacters(in: .whitespacesAndNewlines) == (project.productionURL ?? ""))
            }
            if let urlError {
                Text(urlError).font(.caption).foregroundStyle(Theme.red)
            } else if snapshot.wrangler?.productionURL != nil {
                Text("The wrangler.jsonc route takes priority.").font(.caption).foregroundStyle(.secondary)
            } else {
                Text("Used when wrangler.jsonc has no route. Leave empty to clear.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func saveURL() {
        if model.setProductionURL(project, to: draftURL) {
            urlError = nil
            draftURL = project.productionURL ?? ""
        } else {
            urlError = "Enter an http or https URL."
        }
    }

    private static func milliseconds(_ duration: Duration) -> Int {
        let parts = duration.components
        return Int(parts.seconds) * 1000 + Int(parts.attoseconds / 1_000_000_000_000_000)
    }
}
