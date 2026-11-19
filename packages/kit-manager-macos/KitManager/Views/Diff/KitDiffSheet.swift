import KitManagerCore
import SwiftUI

/// Shows the kit patch without leaving the app or contacting its remote.
struct KitDiffSheet: View {
    let request: DiffRequest

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var layout: DiffLayout = .unified
    @State private var allFiles = false
    @State private var diff: Loadable<KitDiff> = .idle
    @State private var renderError: String?
    @State private var isRendered = false
    /// The commit or compare page on the kit's host; nil when the kit checkout has no web remote.
    @State private var webURL: URL?

    var body: some View {
        VStack(spacing: 0) {
            toolbar
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
            Divider()
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minWidth: 860, idealWidth: 980, minHeight: 420, idealHeight: 620)
        .task(id: allFiles) { await load() }
        .task { await loadWebURL() }
        #if DEBUG
        .onAppear { layout = DebugLaunchOptions.diffLayout }
        #endif
    }

    private var toolbar: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(request.title)
                    .font(.headline)
                    .lineLimit(2)
                    .accessibilityAddTraits(.isHeader)
                Text(revisionLabel)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .textSelection(.enabled)
            }
            Spacer(minLength: 4)
            if request.modules != nil {
                Picker("File scope", selection: $allFiles) {
                    Text("Your modules").tag(false)
                    Text("All files").tag(true)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .fixedSize()
            }
            Picker("Diff layout", selection: $layout) {
                Text("Unified").tag(DiffLayout.unified)
                Text("Side by side").tag(DiffLayout.sideBySide)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .fixedSize()

            if let webURL {
                Link(destination: webURL) {
                    Label {
                        Text("Open on \(RemoteWebURL.hostName(of: webURL))")
                    } icon: {
                        if webURL.host()?.lowercased() == "github.com" {
                            Image("GitHubMark")
                        } else {
                            Image(systemName: "arrow.up.right.square")
                        }
                    }
                    .labelStyle(.iconOnly)
                }
                .buttonStyle(.glass)
                .help("Open on \(RemoteWebURL.hostName(of: webURL))")
                .accessibilityLabel("Open on \(RemoteWebURL.hostName(of: webURL))")
            }
            Button("Done") { dismiss() }
                .buttonStyle(.glassProminent)
                .keyboardShortcut(.cancelAction)
        }
    }

    private func loadWebURL() async {
        guard !AppSettings.kitPath.isEmpty,
            let remote = await model.git.remoteURL(URL(filePath: AppSettings.kitPath)),
            let repository = RemoteWebURL.repository(fromRemote: remote)
        else { return }
        webURL = request.base.map { RemoteWebURL.compare(from: $0, to: request.head, in: repository) }
            ?? RemoteWebURL.commit(request.head, in: repository)
    }

    private var revisionLabel: String {
        let head = String(request.head.prefix(12))
        if let base = request.base { return "\(base.prefix(12)) → \(head)" }
        return head
    }

    @ViewBuilder
    private var content: some View {
        switch diff {
        case .idle, .loading:
            ProgressView("Loading code changes…")
        case .failed(let reason):
            failure(reason)
        case .loaded(let patch, _):
            if let renderError {
                failure(renderError)
            } else if patch.text.isEmpty && !patch.isTruncated {
                ContentUnavailableView(
                    request.modules != nil && !allFiles ? "No file changes in your modules" : "No file changes",
                    systemImage: "doc.text")
            } else {
                VStack(spacing: 0) {
                    if patch.isTruncated { truncationNotice(files: patch.files.count) }
                    if patch.text.isEmpty {
                        ContentUnavailableView("No files fit in the preview", systemImage: "doc.text")
                            .frame(maxHeight: .infinity)
                    } else {
                        DiffWebView(text: patch.text, layout: layout) { error in
                            renderError = error
                            isRendered = true
                        }
                        .overlay {
                            if !isRendered { ProgressView("Rendering code changes…") }
                        }
                    }
                }
            }
        }
    }

    private func truncationNotice(files: Int) -> some View {
        VStack(spacing: 0) {
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Diff preview truncated").font(.callout.weight(.medium))
                    Text(files == 0 ? "The first changed file exceeds the preview limit." : "Only the first \(files) changed files fit within the preview limit.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } icon: {
                Image(systemName: "exclamationmark.triangle").foregroundStyle(.orange)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 20)
            .padding(.vertical, 9)
            .background(.bar)
            Divider()
        }
    }

    private func failure(_ reason: String) -> some View {
        ContentUnavailableView {
            Label("Could Not Show Code Changes", systemImage: "exclamationmark.triangle")
        } description: {
            Text(reason).textSelection(.enabled)
        }
    }

    private func load() async {
        diff = .loading
        renderError = nil
        isRendered = false
        let result: Loadable<KitDiff>
        #if DEBUG
        if let cap = DebugLaunchOptions.diffMaxBytes {
            result = await model.loadKitDiff(request, allFiles: allFiles, maxBytes: cap)
        } else {
            result = await model.loadKitDiff(request, allFiles: allFiles)
        }
        #else
        result = await model.loadKitDiff(request, allFiles: allFiles)
        #endif
        guard !Task.isCancelled else { return }
        diff = result
    }
}
