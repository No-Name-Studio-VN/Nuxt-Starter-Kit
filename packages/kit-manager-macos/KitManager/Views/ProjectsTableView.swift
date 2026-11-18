import KitManagerCore
import SwiftUI
import UniformTypeIdentifiers

struct ProjectsTableView: View {
    let projects: [Project]
    let scope: SidebarItem
    @Binding var path: [UUID]

    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var searchText = ""
    @State private var selection: Set<UUID> = []
    @State private var sortOrder = [KeyPathComparator(\ProjectRow.name, comparator: .localizedStandard)]
    @State private var isImporting = false
    /// Set before the picker opens and cleared only by `handleImport`, so a dismissal cannot lose it.
    @State private var importPurpose: ImportPurpose?
    @State private var locating: Project?
    @State private var scanCandidates: [ScanCandidate]?
    @State private var isScanning = false
    @State private var isDropTargeted = false

    private enum ImportPurpose: Identifiable {
        case add, scan, locate

        var id: Self { self }
    }

    private var rows: [ProjectRow] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        return projects
            .map { ProjectRow(project: $0, snapshot: model.snapshots[$0.id]) }
            .filter { row in
                (scope != .needsAttention || !row.attention.isEmpty)
                    && (query.isEmpty
                        || row.name.localizedStandardContains(query)
                        || row.project.path.localizedStandardContains(query))
            }
            .sorted(using: sortOrder)
    }

    var body: some View {
        let rows = rows
        Group {
            if projects.isEmpty {
                emptyState
            } else if rows.isEmpty {
                if searchText.isEmpty {
                    ContentUnavailableView(
                        "Nothing needs attention", systemImage: "checkmark.circle",
                        description: Text("Every project is up to date and healthy."))
                } else {
                    ContentUnavailableView.search(text: searchText)
                }
            } else {
                table(rows)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.canvas)
        .safeAreaInset(edge: .top, spacing: 0) {
            if model.cliStatus != .ready {
                CLIBanner(status: model.cliStatus)
                    .padding([.horizontal, .top], 16)
                    .padding(.bottom, 4)
                    .transition(reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: model.cliStatus)
        .navigationTitle(scope.title)
        .searchable(text: $searchText, placement: .toolbar, prompt: "Filter by name or path")
        .toolbar { toolbar }
        .overlay { dropOverlay }
        .dropDestination(for: URL.self) { urls, _ in
            model.add(urls: urls) > 0
        } isTargeted: {
            isDropTargeted = $0
        }
        .fileImporter(
            isPresented: $isImporting,
            allowedContentTypes: [.folder], allowsMultipleSelection: importPurpose == .add
        ) { result in
            handleImport(result)
        }
        .sheet(
            isPresented: Binding(get: { scanCandidates != nil }, set: { if !$0 { scanCandidates = nil } })
        ) {
            ScanSheet(candidates: scanCandidates ?? [], knownPaths: model.knownPaths)
        }
    }

    // MARK: Table

    private func table(_ rows: [ProjectRow]) -> some View {
        Table(rows, selection: $selection, sortOrder: $sortOrder) {
            TableColumn("Name", value: \.name) { row in
                VStack(alignment: .leading, spacing: 1) {
                    Text(row.name).fontWeight(.medium).lineLimit(1)
                    Text(row.displayPath)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                .help(row.project.path)
            }
            .width(min: 180, ideal: 260)

            TableColumn("Kit", value: \.kitSortKey) { row in
                Text(row.kitLabel)
                    .font(row.kitIsCommit ? .callout.monospaced() : .callout)
                    .foregroundStyle(row.isKitProject || row.kitLabel == "2.x" ? .primary : .secondary)
                    .lineLimit(1)
            }
            .width(min: 70, ideal: 90, max: 130)

            TableColumn("Status", value: \.statusRank) { row in
                StatusBadge(status: row.status, isOffline: model.isOffline)
            }
            .width(min: 130, ideal: 160, max: 210)

            TableColumn("Modules") { row in
                ModuleChips(modules: row.modules)
            }
            .width(min: 130, ideal: 210)

            TableColumn("Git", value: \.gitSortKey) { row in
                GitSummary(git: row.snapshot?.git)
            }
            .width(min: 110, ideal: 150)

            TableColumn("Actions") { row in
                ProjectActions(row: row, model: model) { locating = row.project; present(.locate) }
            }
            .width(min: 150, ideal: 150, max: 150)
        }
        .scrollContentBackground(.hidden)
        .alternatingRowBackgrounds(.disabled)
        .contextMenu(forSelectionType: UUID.self) { ids in
            contextMenu(for: ids)
        } primaryAction: { ids in
            if let id = ids.first { path.append(id) }
        }
        .accessibilityLabel("Projects")
    }

    @ViewBuilder
    private func contextMenu(for ids: Set<UUID>) -> some View {
        if ids.count == 1, let project = projects.first(where: { ids.contains($0.id) }) {
            Button("Open Details", systemImage: "arrow.right.circle") { path.append(project.id) }
            Divider()
            ProjectMenuItems(
                model: model, project: project, isMissing: model.snapshots[project.id].map(isMissing) ?? false,
                flowItem: model.flowMenuItem(for: project)
            ) {
                locating = project
                present(.locate)
            }
        } else if !ids.isEmpty {
            Button("Refresh", systemImage: "arrow.clockwise") {
                for project in projects where ids.contains(project.id) {
                    Task { await model.refresh(project, force: true) }
                }
            }
            Button("Remove from List", systemImage: "minus.circle", role: .destructive) {
                for project in projects where ids.contains(project.id) { model.remove(project) }
            }
        }
    }

    private func isMissing(_ snapshot: ProjectSnapshot) -> Bool {
        if case .missing = snapshot.kind { return true }
        return false
    }

    // MARK: Empty state, drop overlay

    private var emptyState: some View {
        ContentUnavailableView {
            Label("No projects yet", systemImage: "folder.badge.plus")
        } description: {
            Text("Add a project folder, scan a folder for projects, or drop folders here.")
        } actions: {
            Button("Add Project…") { present(.add) }
                .buttonStyle(.glassProminent)
            Button("Scan Folder…") { present(.scan) }
                .buttonStyle(.glass)
        }
    }

    @ViewBuilder
    private var dropOverlay: some View {
        if isDropTargeted {
            RoundedRectangle(cornerRadius: Theme.radius)
                .strokeBorder(Theme.amber, style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
                .background(Theme.amber.opacity(0.06), in: .rect(cornerRadius: Theme.radius))
                .padding(8)
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        }
    }

    // MARK: Toolbar and import

    @ToolbarContentBuilder
    private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .status) { fetchStatus }
        ToolbarItemGroup {
            Button("Add Project", systemImage: "plus") { present(.add) }
                .help("Add project folders")
            Button("Scan Folder", systemImage: "magnifyingglass.circle") { present(.scan) }
                .help("Find projects inside a folder")
                .disabled(isScanning)
            Button("Refresh", systemImage: "arrow.clockwise") { Task { await model.refreshAll(force: true) } }
                .help("Refresh all projects (⌘R)")
                .disabled(model.isRefreshing)
        }
    }

    @ViewBuilder
    private var fetchStatus: some View {
        switch model.fetchState {
        case .offline:
            Label("Offline", systemImage: "wifi.slash")
                .foregroundStyle(.secondary)
                .help("The kit could not be fetched. Showing the last known main.")
        case .fetching:
            HStack(spacing: 6) {
                ProgressView().controlSize(.small)
                Text("Fetching kit").foregroundStyle(.secondary)
            }
        case .idle, .fetched:
            if model.isRefreshing || isScanning {
                ProgressView().controlSize(.small).accessibilityLabel("Refreshing")
            }
        }
    }

    private func present(_ purpose: ImportPurpose) {
        importPurpose = purpose
        isImporting = true
    }

    private func handleImport(_ result: Result<[URL], any Error>) {
        let purpose = importPurpose
        importPurpose = nil
        switch result {
        case .failure(let error):
            // Cancelling the picker is not an error.
            if !isUserCancellation(error) { model.errorMessage = error.localizedDescription }
            locating = nil
        case .success(let urls):
            switch purpose {
            case .add:
                model.add(urls: urls)
            case .scan:
                guard let folder = urls.first else { return }
                isScanning = true
                Task {
                    let found = await model.scan(folder: folder)
                    isScanning = false
                    scanCandidates = found
                }
            case .locate:
                if let project = locating, let url = urls.first { model.relocate(project, to: url) }
                locating = nil
            case nil:
                break
            }
        }
    }

    private func isUserCancellation(_ error: any Error) -> Bool {
        let nsError = error as NSError
        return nsError.domain == NSCocoaErrorDomain && nsError.code == NSUserCancelledError
    }
}
