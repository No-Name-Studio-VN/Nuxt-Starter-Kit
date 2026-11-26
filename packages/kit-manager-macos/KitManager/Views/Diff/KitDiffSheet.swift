import KitManagerCore
import SwiftUI

/// Presents one selected patch from either local comparison source.
struct KitDiffSheet: View {
    let request: DiffRequest

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var layout: DiffLayout = .unified
    @State private var allFiles = false
    @State private var comparison: DiffComparison?
    @State private var loadError: String?
    @State private var selection: DiffFile.ID?
    @State private var patch = FileDiffSelection()
    @State private var query = ""
    @FocusState private var searchFocused: Bool
    @State private var webURL: URL?

    private var hasScope: Bool {
        if case .upstream(_, _, let modules) = request.source { return modules != nil }
        return false
    }

    private var files: [DiffFile] {
        guard let comparison else { return [] }
        return allFiles ? comparison.allFiles : comparison.scopedFiles ?? []
    }

    private var selected: DiffFile? { files.first { $0.id == selection } }

    var body: some View {
        VStack(spacing: 0) {
            toolbar
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
            Divider()
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .frame(minWidth: 600, idealWidth: 1000, minHeight: 360, idealHeight: 620)
        .task { await prepare() }
        .task { await loadWebURL() }
        .task(id: selection) {
            guard let comparison else { return }
            await patch.load(selected) { path in
                try await comparison.patch(path: path, maxBytes: maxBytes)
            }
        }
        .onChange(of: allFiles) {
            guard selected == nil else { return }
            if let focus = request.focusPath {
                selection = files.first { $0.matches(path: focus) }?.id
            } else {
                selection = files.first?.id
            }
        }
        .onDisappear { comparison?.close() }
        #if DEBUG
        .onAppear { layout = DebugLaunchOptions.diffLayout }
        #endif
    }

    private var maxBytes: Int {
        #if DEBUG
        if let cap = DebugLaunchOptions.diffMaxBytes { return cap }
        #endif
        return FilePatch.maximumBytes
    }

    private var toolbar: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 12) {
                heading.fixedSize(horizontal: true, vertical: false)
                Spacer(minLength: 4)
                controls
            }
            VStack(alignment: .leading, spacing: 10) {
                heading
                HStack {
                    Spacer(minLength: 0)
                    controls
                }
            }
        }
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(request.title)
                .font(.headline)
                .lineLimit(2)
                .truncationMode(.middle)
                .accessibilityAddTraits(.isHeader)
            Text(revisionLabel)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .textSelection(.enabled)
        }
    }

    private var revisionLabel: String {
        switch request.source {
        case .upstream(let base, let head, _):
            let range = base.map { "\($0.prefix(12)) → \(head.prefix(12))" } ?? String(head.prefix(12))
            return "Upstream kit patch: \(range)"
        case .project:
            if case .project(let source, _) = comparison {
                return "Installed kit \(source.commit.prefix(12)) → files on disk"
            }
            return "Installed kit → files on disk"
        }
    }

    private var controls: some View {
        HStack(spacing: 12) {
            if hasScope {
                Picker("File scope", selection: $allFiles) {
                    Text("Your modules").tag(false)
                    Text("All files").tag(true)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .fixedSize()
                .disabled(comparison == nil)
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

    @ViewBuilder
    private var content: some View {
        if let loadError {
            failure(loadError)
        } else if let comparison {
            if !allFiles && comparison.scopedFiles == nil {
                notice("Module List Unavailable", detail: "Switch to All files to see the unfiltered changes.")
            } else {
                HStack(spacing: 0) {
                    fileList
                        .frame(minWidth: 180, idealWidth: 245, maxWidth: 280)
                    Divider()
                    patchPane
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
        } else {
            ProgressView("Preparing file comparison…")
        }
    }

    private var fileList: some View {
        let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let visible = search.isEmpty ? files : files.filter {
            $0.path.localizedStandardContains(search) || $0.previousPath?.localizedStandardContains(search) == true
        }
        return VStack(spacing: 0) {
            HStack(spacing: 6) {
                Button {
                    searchFocused = true
                } label: {
                    Label("Search Files", systemImage: "magnifyingglass").labelStyle(.iconOnly)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .keyboardShortcut("f")
                TextField("Filter files", text: $query)
                    .textFieldStyle(.plain)
                    .focused($searchFocused)
                if !query.isEmpty {
                    Button("Clear Filter", systemImage: "xmark.circle.fill") { query = "" }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.plain)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(10)
            Divider()
            if visible.isEmpty {
                Text(search.isEmpty ? "No changed files" : "No matching files")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .frame(maxHeight: .infinity)
            } else {
                ScrollViewReader { scroll in
                    List(visible, selection: $selection) { file in
                        HStack(spacing: 8) {
                            Image(systemName: file.status.symbol)
                                .frame(width: 16)
                                .accessibilityHidden(true)
                            Text(file.path)
                                .lineLimit(1)
                                .truncationMode(.middle)
                        }
                        .font(.callout)
                        .help(file.displayPath)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(file.status.label): \(file.displayPath)")
                        .tag(file.id)
                        .id(file.id)
                    }
                    .listStyle(.plain)
                    .accessibilityLabel("Changed Files")
                    .onChange(of: selection, initial: true) {
                        if let selection { scroll.scrollTo(selection) }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var patchPane: some View {
        if let file = selected {
            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Label(file.displayPath, systemImage: file.status.symbol)
                        .font(.callout.weight(.medium))
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .help(file.displayPath)
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 0)
                    if case .project(let project, _) = request.source,
                        model.projectDiffEditorFile(in: project, path: file.path) != nil
                    {
                        Button("Open in Editor", systemImage: "chevron.left.forwardslash.chevron.right") {
                            Task { await model.openProjectDiffFile(in: project, path: file.path) }
                        }
                        .fixedSize()
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                Divider()
                selectedPatch(file)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        } else if let focus = request.focusPath, !files.contains(where: { $0.matches(path: focus) }) {
            notice("No Patch for This File", detail: "\(focus) is not in this file scope. Select another file to view its changes.")
        } else {
            notice(files.isEmpty ? "No File Changes" : "Select a File", detail: nil)
        }
    }

    @ViewBuilder
    private func selectedPatch(_ file: DiffFile) -> some View {
        switch patch.patch(for: file) {
        case .idle, .loading:
            ProgressView("Loading file changes…")
        case .failed(let reason):
            failure(reason)
        case .loaded(let result, _):
            switch result {
            case .text(let text):
                SelectedPatchWebView(text: text, layout: layout).id(file.id)
            case .unchanged:
                notice("No File Changes", detail: "This file matches the installed kit.")
            case .missing:
                notice("No Patch for This File", detail: "This file is not in the comparison.")
            case .unavailable:
                notice("Patch Unavailable", detail: "This file could not be compared safely or is no longer available.")
            case .binary:
                notice("Binary File", detail: "Changes to this file aren’t available as a text patch.")
            case .tooLarge:
                notice("File Too Large to Preview", detail: "The file or its patch exceeds the preview limit.")
            }
        }
    }

    private func notice(_ title: String, detail: String?) -> some View {
        ContentUnavailableView {
            Label(title, systemImage: "doc.text")
        } description: {
            if let detail { Text(detail).textSelection(.enabled) }
        }
    }

    private func failure(_ reason: String) -> some View {
        ContentUnavailableView {
            Label("Could Not Show Code Changes", systemImage: "exclamationmark.triangle")
        } description: {
            Text(reason).textSelection(.enabled)
        }
    }

    private func prepare() async {
        do {
            let prepared = try await model.prepareDiff(request)
            guard !Task.isCancelled else {
                prepared.close()
                return
            }
            comparison = prepared
            if let focus = request.focusPath {
                let file = prepared.allFiles.first { $0.matches(path: focus) }
                if let file, prepared.scopedFiles?.contains(where: { $0.id == file.id }) != true { allFiles = true }
                selection = file?.id
            } else {
                selection = files.first?.id
            }
        } catch {
            if !Task.isCancelled { loadError = error.localizedDescription }
        }
    }

    private func loadWebURL() async {
        guard case .upstream(let base, let head, _) = request.source, !AppSettings.kitPath.isEmpty,
            let remote = await model.git.remoteURL(URL(filePath: AppSettings.kitPath)),
            let repository = RemoteWebURL.repository(fromRemote: remote)
        else { return }
        webURL = base.map { RemoteWebURL.compare(from: $0, to: head, in: repository) }
            ?? RemoteWebURL.commit(head, in: repository)
    }
}

private struct SelectedPatchWebView: View {
    let text: String
    let layout: DiffLayout
    @State private var rendered = false
    @State private var error: String?

    var body: some View {
        if let error {
            ContentUnavailableView {
                Label("Could Not Render Patch", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error).textSelection(.enabled)
            }
        } else {
            DiffWebView(text: text, layout: layout) {
                error = $0
                rendered = true
            }
            .overlay {
                if !rendered { ProgressView("Rendering code changes…") }
            }
        }
    }
}

private extension DiffFile {
    var displayPath: String { previousPath.map { "\($0) → \(path)" } ?? path }
}

private extension DiffFile.Status {
    var symbol: String {
        switch self {
        case .added: "plus.circle"
        case .modified: "pencil"
        case .deleted: "minus.circle"
        case .renamed: "arrow.right"
        case .copied: "plus.square.on.square"
        case .typeChanged: "arrow.left.arrow.right"
        }
    }

    var label: String {
        switch self {
        case .added: "Added"
        case .modified: "Modified"
        case .deleted: "Deleted"
        case .renamed: "Renamed"
        case .copied: "Copied"
        case .typeChanged: "Type changed"
        }
    }
}
