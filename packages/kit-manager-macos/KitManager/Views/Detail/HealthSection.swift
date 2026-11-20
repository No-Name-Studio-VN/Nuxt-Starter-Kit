import KitManagerCore
import SwiftUI

/// Source control, environment keys and website health as tiles; selecting a tile opens its details below.
struct HealthSection: View {
    let project: Project
    let snapshot: ProjectSnapshot

    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var selection: Item?
    @State private var draftURL = ""
    @State private var urlError: String?
    @State private var isChecking = false

    private static let routeLimit = 4
    /// The width three tiles need side by side; a narrower detail column stacks them.
    private static let rowWidth: CGFloat = 540

    private enum Item: String {
        case sourceControl, environment, website
    }

    var body: some View {
        Section("Health") {
            VStack(alignment: .leading, spacing: 12) {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 10) { tiles(compact: false) }
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(minWidth: 0, idealWidth: Self.rowWidth, maxWidth: .infinity)
                    VStack(spacing: 8) { tiles(compact: true) }
                }
                if let selection {
                    details(for: selection)
                        .id(selection)
                        .transition(.opacity.combined(with: .offset(y: -8)))
                }
            }
            .padding(.vertical, 4)
            .onAppear {
                draftURL = project.productionURL ?? ""
                #if DEBUG
                if let item = DebugLaunchOptions.healthSelection.flatMap(Item.init(rawValue:)) { selection = item }
                #endif
            }
        }
    }

    @ViewBuilder
    private func tiles(compact: Bool) -> some View {
        sourceControlTile(compact: compact)
        environmentTile(compact: compact)
        websiteTile(compact: compact)
    }

    private func toggle(_ item: Item) {
        withAnimation(reduceMotion ? nil : .snappy(duration: 0.3)) {
            selection = selection == item ? nil : item
        }
    }

    private func details(for item: Item) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            switch item {
            case .sourceControl: sourceControlDetails
            case .environment: environmentDetails
            case .website: websiteDetails
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.fill.quinary, in: .rect(cornerRadius: 14, style: .continuous))
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private func openButton(_ title: String, file: String) -> some View {
        Button(title, systemImage: "chevron.left.forwardslash.chevron.right") {
            Task { await model.openInVSCode(project, relativePath: file) }
        }
        .buttonStyle(.glass)
        .controlSize(.small)
        .help("Open \(file) in VS Code")
    }

    // MARK: Source control

    private func sourceControlTile(compact: Bool) -> some View {
        let value: String
        let detail: String
        let status: HealthTile.Status
        if let git = snapshot.git {
            value = git.branch ?? "Detached HEAD"
            let changes = switch git.dirtyCount {
            case 0: "No unsaved changes"
            case 1: "1 unsaved change"
            default: "\(git.dirtyCount) unsaved changes"
            }
            if let ahead = git.ahead, let behind = git.behind {
                detail = "\(changes) · ↑\(ahead) ↓\(behind)"
            } else {
                detail = changes
            }
            status = git.dirtyCount > 0 ? .init(title: "Unsaved", tone: .warning) : .init(title: "All saved", tone: .positive)
        } else {
            value = "No repository"
            detail = "Not tracked by git"
            status = .init(title: "Off", tone: .neutral)
        }
        return HealthTile(
            title: "Source Control", symbol: "arrow.triangle.branch", color: .indigo,
            value: value, detail: detail, status: status, isSelected: selection == .sourceControl,
            isCompact: compact
        ) { toggle(.sourceControl) }
    }

    @ViewBuilder
    private var sourceControlDetails: some View {
        if let git = snapshot.git {
            LabeledContent("Branch") {
                Text(git.branch ?? "Detached HEAD")
                    .font(.callout.monospaced())
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .textSelection(.enabled)
            }
            LabeledContent(
                "Unsaved changes",
                value: git.dirtyCount == 0 ? "None" : git.dirtyCount == 1 ? "1 file" : "\(git.dirtyCount) files"
            )
            LabeledContent("Last commit", value: git.lastCommitDate?.formatted(.relative(presentation: .named)) ?? "—")
            LabeledContent("Upstream") {
                if let ahead = git.ahead, let behind = git.behind {
                    Text("↑\(ahead) ahead · ↓\(behind) behind")
                        .monospacedDigit()
                        .accessibilityLabel("\(ahead) ahead, \(behind) behind")
                } else {
                    Text("No upstream").foregroundStyle(.secondary)
                }
            }
        } else {
            note("This folder isn't a git repository, so there's no branch or change history to show.")
        }
    }

    // MARK: Environment

    private func environmentTile(compact: Bool) -> some View {
        let (value, detail, status): (String, String, HealthTile.Status)
        if let env = snapshot.env {
            if !env.hasExample {
                (value, detail, status) = ("No .env.example", "Nothing to compare", .init(title: "Skipped", tone: .neutral))
            } else if !env.hasEnv {
                (value, detail, status) = ("No .env file", "Copy .env.example to start", .init(title: "Missing", tone: .warning))
            } else if !env.missing.isEmpty {
                let count = env.missing.count == 1 ? "1 key missing" : "\(env.missing.count) keys missing"
                (value, detail, status) = (count, env.missing.joined(separator: ", "), .init(title: "Incomplete", tone: .warning))
            } else {
                (value, detail, status) = ("All keys set", ".env matches .env.example", .init(title: "Ready", tone: .positive))
            }
        } else {
            (value, detail, status) = ("—", "Couldn't read the env files", .init(title: "Unknown", tone: .neutral))
        }
        return HealthTile(
            title: "Environment", symbol: "key.fill", color: .gray,
            value: value, detail: detail, status: status, isSelected: selection == .environment,
            isCompact: compact
        ) { toggle(.environment) }
    }

    @ViewBuilder
    private var environmentDetails: some View {
        if let env = snapshot.env {
            if !env.hasExample {
                note("This project has no .env.example, so there's nothing to check .env against.")
            } else if !env.hasEnv {
                note("There's no .env file yet. Copy .env.example to .env, then fill in the values.")
                openButton("Open .env.example", file: ".env.example")
            } else if !env.missing.isEmpty {
                note("These keys are in .env.example but not set in .env:")
                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 160), spacing: 6, alignment: .leading)],
                    alignment: .leading, spacing: 6
                ) {
                    ForEach(env.missing, id: \.self) { key in
                        Text(key)
                            .font(.caption.monospaced())
                            .lineLimit(1)
                            .truncationMode(.middle)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(.fill.tertiary, in: .rect(cornerRadius: 6, style: .continuous))
                            .help(key)
                    }
                }
                .textSelection(.enabled)
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Missing keys: \(env.missing.joined(separator: ", "))")
                openButton("Open .env", file: ".env")
            } else {
                note("Every key in .env.example has a value in .env.")
                openButton("Open .env", file: ".env")
            }
        } else {
            note("The environment files couldn't be read.")
        }
    }

    // MARK: Website

    private var resolvedURL: URL? {
        ProductionURL.resolve(wrangler: snapshot.wrangler, override: project.productionURL)
    }

    private func websiteTile(compact: Bool) -> some View {
        let value = resolvedURL?.host() ?? "No URL"
        let (detail, status): (String, HealthTile.Status)
        if resolvedURL == nil {
            (detail, status) = ("Add a production URL", .init(title: "Not set", tone: .neutral))
        } else if isChecking {
            (detail, status) = ("Checking…", .init(title: "Checking", tone: .neutral))
        } else if let health = snapshot.health {
            if let code = health.statusCode {
                let latency = health.latency.map { " · \(Self.milliseconds($0)) ms" } ?? ""
                (detail, status) = (
                    "HTTP \(code)\(latency)",
                    health.isUp ? .init(title: "Online", tone: .positive) : .init(title: "Down", tone: .critical)
                )
            } else {
                (detail, status) = ("Unreachable", .init(title: "Offline", tone: .critical))
            }
        } else {
            (detail, status) = ("Not checked yet", .init(title: "Unknown", tone: .neutral))
        }
        return HealthTile(
            title: "Website", symbol: "globe", color: .blue,
            value: value, detail: detail, status: status, isSelected: selection == .website,
            isCompact: compact
        ) { toggle(.website) }
    }

    @ViewBuilder
    private var websiteDetails: some View {
        if let name = snapshot.wrangler?.workerName {
            LabeledContent("Worker") {
                Text(name).font(.callout.monospaced()).lineLimit(1).truncationMode(.middle)
            }
        } else if snapshot.wrangler == nil {
            note("No wrangler.jsonc")
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
        Divider().padding(.vertical, 2)
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
                .labelsHidden()
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
