import KitManagerCore
import SwiftUI

/// Source control, environment key names, and website health at a glance.
struct HealthSection: View {
    let project: Project
    let snapshot: ProjectSnapshot

    @Environment(AppModel.self) private var model
    @State private var draftURL = ""
    @State private var urlError: String?
    @State private var isChecking = false

    private static let routeLimit = 4

    var body: some View {
        Section("Health") {
            sourceControl
            environment
            website
        }
        .onAppear { draftURL = project.productionURL ?? "" }
    }

    private func row<Value: View>(
        _ title: String, symbol: String, color: Color, status: Color, @ViewBuilder value: () -> Value
    ) -> some View {
        let icon = SettingsIcon(symbol: symbol, color: color).accessibilityHidden(true)
        let dot = Circle().fill(status).frame(width: 8, height: 8).accessibilityHidden(true)
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 10) {
                icon
                Text(title).fixedSize()
                Spacer(minLength: 4)
                value().foregroundStyle(.secondary)
                dot
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 10) {
                    icon
                    Text(title)
                    Spacer()
                    dot
                }
                value()
                    .foregroundStyle(.secondary)
                    .padding(.leading, 32)
            }
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: Source control

    @ViewBuilder
    private var sourceControl: some View {
        if let git = snapshot.git {
            DisclosureGroup {
                LabeledContent("Last commit", value: git.lastCommitDate?.formatted(.relative(presentation: .named)) ?? "—")
                LabeledContent("Upstream") {
                    if let ahead = git.ahead, let behind = git.behind {
                        Text("↑\(ahead) ahead · ↓\(behind) behind").monospacedDigit()
                    } else {
                        Text("No upstream").foregroundStyle(.secondary)
                    }
                }
            } label: {
                row("Source Control", symbol: "arrow.triangle.branch", color: .indigo, status: git.dirtyCount > 0 ? .orange : .green) {
                    HStack(spacing: 5) {
                        Text(git.branch ?? "detached")
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .help(git.branch ?? "Detached HEAD")
                        Text(git.dirtyCount == 0 ? "· No unsaved changes" : "· \(git.dirtyCount) unsaved")
                            .fixedSize(horizontal: true, vertical: false)
                        if let ahead = git.ahead, let behind = git.behind {
                            Text("↑\(ahead) ↓\(behind)")
                                .monospacedDigit()
                                .fixedSize()
                                .accessibilityLabel("\(ahead) ahead, \(behind) behind")
                        }
                    }
                }
            }
        } else {
            row("Source Control", symbol: "arrow.triangle.branch", color: .indigo, status: .secondary) {
                Text("Not a git repository")
            }
        }
    }

    // MARK: Environment

    @ViewBuilder
    private var environment: some View {
        if let env = snapshot.env, env.hasExample, !env.missing.isEmpty {
            DisclosureGroup {
                VStack(alignment: .leading, spacing: 2) {
                    ForEach(env.missing, id: \.self) { key in
                        Text(key).font(.caption.monospaced()).lineLimit(1).truncationMode(.middle)
                    }
                }
                .textSelection(.enabled)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Missing keys: \(env.missing.joined(separator: ", "))")
            } label: {
                environmentRow
            }
        } else {
            environmentRow
        }
    }

    private var environmentRow: some View {
        let (value, status): (String, Color)
        if let env = snapshot.env {
            if !env.hasExample {
                (value, status) = ("No .env.example", .secondary)
            } else if !env.hasEnv {
                (value, status) = ("No .env file", .orange)
            } else if !env.missing.isEmpty {
                (value, status) = ("\(env.missing.count) missing", .orange)
            } else {
                (value, status) = ("All keys set", .green)
            }
        } else {
            (value, status) = ("—", .secondary)
        }
        return row("Environment", symbol: "key.fill", color: .gray, status: status) {
            Text(value)
        }
    }

    // MARK: Website

    private var resolvedURL: URL? {
        ProductionURL.resolve(wrangler: snapshot.wrangler, override: project.productionURL)
    }

    private var websiteStatusColor: Color {
        guard resolvedURL != nil, !isChecking, let health = snapshot.health else { return .secondary }
        return health.isUp ? .green : .red
    }

    private var website: some View {
        DisclosureGroup {
            if let name = snapshot.wrangler?.workerName {
                LabeledContent("Worker") {
                    Text(name).font(.callout.monospaced()).lineLimit(1).truncationMode(.middle)
                }
            } else if snapshot.wrangler == nil {
                Text("No wrangler.jsonc").font(.callout).foregroundStyle(.secondary)
            }
            if let routes = snapshot.wrangler?.routes, !routes.isEmpty {
                LabeledContent(routes.count == 1 ? "Route" : "Routes") {
                    VStack(alignment: .trailing, spacing: 2) {
                        ForEach(routes.prefix(Self.routeLimit), id: \.self) { route in
                            Text(route).font(.caption.monospaced()).lineLimit(1).truncationMode(.middle)
                        }
                        if routes.count > Self.routeLimit {
                            Text("+\(routes.count - Self.routeLimit) more").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .textSelection(.enabled)
                    .help(routes.joined(separator: "\n"))
                }
            }
            if let url = resolvedURL {
                LabeledContent("URL") {
                    Text(url.absoluteString)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .textSelection(.enabled)
                }
                if let health = snapshot.health, health.statusCode == nil, let error = health.error {
                    Label(error, systemImage: "wifi.exclamationmark")
                        .font(.callout)
                        .foregroundStyle(.red)
                }
            }
            urlOverride
            if resolvedURL != nil {
                HStack {
                    Spacer()
                    Button("Check Now", systemImage: "arrow.clockwise") {
                        isChecking = true
                        Task {
                            await model.checkHealth(project)
                            isChecking = false
                        }
                    }
                    .buttonStyle(.glass)
                    .disabled(isChecking)
                }
            }
        } label: {
            row("Website", symbol: "globe", color: .blue, status: websiteStatusColor) {
                HStack(spacing: 5) {
                    if let host = resolvedURL?.host() {
                        Text(host)
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .help(resolvedURL?.absoluteString ?? host)
                        Text("·").accessibilityHidden(true)
                    }
                    websiteStatus
                }
            }
        }
    }

    @ViewBuilder
    private var websiteStatus: some View {
        if isChecking {
            ProgressView().controlSize(.mini)
            Text("Checking…")
        } else if resolvedURL != nil, let health = snapshot.health {
            if let code = health.statusCode {
                Text("\(code)").fixedSize().accessibilityLabel("\(health.isUp ? "Up" : "Down"), status \(code)")
                if let latency = health.latency {
                    Text("· \(Self.milliseconds(latency)) ms").monospacedDigit().fixedSize()
                }
            } else {
                Text("Unreachable")
            }
        } else {
            Text("Not checked")
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
                    .buttonStyle(.glass)
                    .disabled(draftURL.trimmingCharacters(in: .whitespacesAndNewlines) == (project.productionURL ?? ""))
            }
            if let urlError {
                Text(urlError).font(.caption).foregroundStyle(Color.red)
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
