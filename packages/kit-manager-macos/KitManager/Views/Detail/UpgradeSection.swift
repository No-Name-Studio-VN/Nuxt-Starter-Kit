import KitManagerCore
import SwiftUI

/// Kit version status, update cost, and the controls for previewing or starting an update.
struct UpgradeSection: View {
    let project: Project
    let snapshot: ProjectSnapshot

    @Environment(AppModel.self) private var model
    @Environment(\.openKitDiff) private var openKitDiff

    private var installedModules: Set<String> { Set(snapshot.kitState?.modules ?? []) }

    /// The project's kit commit to the latest main, when both are known.
    private var updateRange: (base: String, head: String)? {
        guard let base = snapshot.kitState?.commit, let head = model.latestMain else { return nil }
        return (base, head)
    }
    @State private var isChangelogExpanded: Bool = {
        #if DEBUG
        // Launch with -KMDebugExpandChangelog YES to capture the update changelog without clicking.
        UserDefaults.standard.bool(forKey: "KMDebugExpandChangelog")
        #else
        false
        #endif
    }()

    private var status: ProjectStatus { ProjectStatus(snapshot: snapshot) }
    private var versionLabel: String { snapshot.versionLabel ?? snapshot.kitState.map { String($0.commit.prefix(7)) } ?? "—" }
    private var latestLabel: String { model.latestLabel ?? model.latestMain.map { String($0.prefix(7)) } ?? "—" }

    /// Inspect supersedes the conflict paths recorded at the time of the last update.
    private var unresolvedConflicts: [String] {
        snapshot.inspect.value?.conflicts.unresolved ?? snapshot.kitState?.conflicts ?? []
    }

    var body: some View {
        Section {
            statusRow
            if let record = model.rollbackRecord(for: project), model.flow == nil {
                interruptedUpdate(record)
            }
            if showsPreview {
                if showsPreviewStatus && !showsUpdateBanner { previewStatusRow }
                DisclosureGroup("Details") {
                    VStack(alignment: .leading, spacing: 10) {
                        preview
                        if !showsPreviewStatus { previewButton }
                    }
                }
            }
            if case .pinned = status {
                DisclosureGroup("Show command") {
                    Text("nuxt-saas upgrade --template \(KitState.defaultTemplate)")
                        .font(.callout.monospaced())
                        .textSelection(.enabled)
                }
            }
            if snapshot.usesDefaultTemplate, (snapshot.behind ?? 0) > 0 {
                DisclosureGroup("What's new in this update", isExpanded: $isChangelogExpanded) {
                    ChangelogSection(
                        snapshot: snapshot,
                        onOpenChange: openKitDiff.map { open in { open(.change($0, modules: installedModules)) } },
                        onViewAll: updateRange.flatMap { range in
                            openKitDiff.map { open in
                                {
                                    open(DiffRequest(
                                        title: "Update to \(latestLabel)", base: range.base, head: range.head,
                                        modules: installedModules))
                                }
                            }
                        })
                }
            }
        } header: {
            Text("Kit Update")
        } footer: {
            if !unresolvedConflicts.isEmpty {
                Text("Fix the conflict markers in these files before updating again.")
            } else if status != .upToDate, !canUpgrade {
                Text(blockedReason)
            } else if case .behind = status {
                Text("Claude applies the update on a new branch and walks you through anything that needs merging. Your current branch is not touched.")
            }
        }
    }

    // MARK: Status

    @ViewBuilder
    private var statusRow: some View {
        switch status {
        case .behind(let count, _):
            updateBanner(count: count)
        case .upToDate:
            Label {
                Text("You're on the latest kit (\(versionLabel))")
            } icon: {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
            }
        case .unresolvedConflicts:
            unresolved
            updateButtonRow
        case .pinned(let ref):
            blockedUpdateRow("Kit updates won't follow new releases while this project is locked to \(ref). Previews use that ref and need a network connection.")
        case .otherTemplate:
            blockedUpdateRow("This project was made from another template, so there's no kit version to compare. Previews use that template and need a network connection.")
        case .commitNotOnMain(let sha):
            blockedUpdateRow("Kit commit \(sha) isn't on main in your kit checkout, so we can't compare versions. Previews fetch it from the recorded template.")
        case .checkFailed(let message):
            FailureView(message: message)
            updateButtonRow
        case .kitUnavailable(let reason):
            VStack(alignment: .leading, spacing: 6) {
                Label(status.title, systemImage: status.symbol)
                note(reason)
                note("Check the kit path in Settings: it needs an origin remote with a main branch.")
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    kitRecoveryActions
                    Spacer(minLength: 0)
                    updateButton
                }
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) { kitRecoveryActions }
                    updateButtonRow
                }
            }
        case .checking:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                note("Checking against the latest kit…")
            }
            updateButtonRow
        case .missing, .invalid, .kitSource, .needsMigration:
            EmptyView()
        }
    }

    @ViewBuilder
    private var kitRecoveryActions: some View {
        Button("Fetch Again") { Task { await model.fetchKit() } }
            .buttonStyle(.glass)
            .fixedSize()
            .disabled(model.fetchState == .fetching)
        SettingsLink { Text("Open Settings") }
            .buttonStyle(.glass)
            .fixedSize()
    }

    private var showsUpdateBanner: Bool {
        if case .behind = status { return true }
        return false
    }

    private func updateBanner(count: Int) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) {
                    bannerInfo(count: count)
                    Spacer(minLength: 8)
                    updateButton
                }
                VStack(alignment: .leading, spacing: 10) {
                    bannerInfo(count: count)
                    updateButtonRow
                }
            }
            if showsPreviewStatus { previewStatusRow }
        }
        .padding(.vertical, 4)
    }

    private func bannerInfo(count: Int) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "arrow.down.circle.fill")
                .font(.system(size: 34))
                .foregroundStyle(.white, Color.accentColor)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text("Kit \(latestLabel) is available").font(.headline)
                let changes = count == 1 ? "1 change" : "\(count) changes"
                note("You're on \(versionLabel) · \(changes)")
                    .accessibilityLabel("You're on \(versionLabel). \(changes) since your version.")
                if let report = snapshot.preview.value {
                    previewCost(report)
                }
            }
        }
    }

    private func previewCost(_ report: TransitionReport) -> some View {
        let changed = report.changes.filter { $0.kind != .keepEdited && $0.kind != .keepProtected }
        let merges = changed.count { $0.kind == .merge }
        let conflicts = report.conflicts.count
        return HStack(spacing: 12) {
            Label(changed.count == 1 ? "1 file" : "\(changed.count) files", systemImage: "doc")
            Label("\(merges) to merge", systemImage: "arrow.triangle.merge")
            Label(
                conflicts == 0 ? "No conflicts" : conflicts == 1 ? "1 conflict" : "\(conflicts) conflicts",
                systemImage: conflicts == 0 ? "checkmark.seal" : "exclamationmark.triangle"
            )
            .foregroundStyle(conflicts == 0 ? Color.green : .red)
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .padding(.top, 2)
    }

    private var unresolved: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                Label(status.title, systemImage: status.symbol)
                    .foregroundStyle(.red)
                Spacer(minLength: 0)
                Button("Fix with Claude", systemImage: "sparkles") {
                    Task { await model.openTerminal(project, command: .claude) }
                }
                .buttonStyle(.glass)
            }
            if snapshot.behind != nil {
                HStack(spacing: 8) {
                    Text(versionLabel)
                    Image(systemName: "arrow.right").accessibilityLabel("to")
                    Text(latestLabel)
                }
                .font(.callout)
                .foregroundStyle(.secondary)
            }
            ForEach(unresolvedConflicts, id: \.self) { path in
                Text(path).font(.caption.monospaced()).lineLimit(1).truncationMode(.middle)
            }
        }
    }

    /// Rollback remains available after an interrupted update's sheet closes.
    private func interruptedUpdate(_ record: UpgradeBranchRecord) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label {
                Text("The last update stopped on \(record.branch), which Kit Manager created from \(record.previous).")
            } icon: {
                Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.orange)
            }
            .font(.callout)
            RollbackButton(project: project, record: record) {
                Task {
                    do {
                        try await model.rollBackUpgrade(project, branch: record.branch, previous: record.previous)
                    } catch {
                        model.errorMessage = error.localizedDescription
                    }
                }
            }
        }
    }

    private func blockedUpdateRow(_ message: String) -> some View {
        HStack(spacing: 10) {
            note(message)
            Spacer(minLength: 0)
            updateButton
        }
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    // MARK: Preview

    private var showsPreview: Bool {
        switch status {
        case .upToDate, .kitUnavailable: false
        default: true
        }
    }

    private var showsPreviewStatus: Bool {
        switch snapshot.preview {
        case .idle, .loading, .failed: true
        case .loaded: false
        }
    }

    private var previewStatusRow: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                previewStatus
                Spacer(minLength: 0)
                previewButton
            }
            VStack(alignment: .leading, spacing: 8) {
                previewStatus
                previewButton
            }
        }
    }

    @ViewBuilder
    private var previewStatus: some View {
        if case .failed = snapshot.preview {
            Label {
                Text("Couldn't prepare the update preview")
            } icon: {
                Image(systemName: "exclamationmark.circle").foregroundStyle(.red)
            }
            .font(.callout)
            .foregroundStyle(.secondary)
        } else if snapshot.preview == .loading {
            previewProgress
        } else {
            note("Preview not prepared yet")
        }
    }

    private var previewProgress: some View {
        HStack(spacing: 8) {
            ProgressView().controlSize(.small)
            note("Previewing update…")
        }
    }

    private var previewButton: some View {
        Button("Preview Again", systemImage: "arrow.clockwise") {
            Task { await model.loadPreview(project) }
        }
        .buttonStyle(.glass)
        .fixedSize()
        .disabled(snapshot.preview == .loading || model.cliStatus != .ready)
        .help(model.cliStatus == .ready ? "Render the update again" : "Build the nuxt-saas CLI first")
    }

    @ViewBuilder
    private var preview: some View {
        switch snapshot.preview {
        case .idle:
            note(
                model.cliStatus == .ready
                    ? "No preview yet. A preview shows what the update would do without changing anything."
                    : "Update previews need the built nuxt-saas CLI.")
        case .loading:
            previewProgress
        case .failed(let message):
            FailureView(message: message)
        case .loaded(let report, let stale):
            if report.upToDate == true {
                note("Nothing to update.")
            } else {
                ChangeSummaryChips(changes: report.changes)
                ChangeFileList(changes: report.changes)
                followUps(report.followUps)
            }
            if stale {
                Label("Computed for an earlier state of the project. Preview again to refresh.", systemImage: "clock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private func followUps(_ items: [String]) -> some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("Follow-ups").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                ForEach(items, id: \.self) { item in
                    Label {
                        Text(item).font(.callout).fixedSize(horizontal: false, vertical: true)
                    } icon: {
                        Image(systemName: "arrow.turn.down.right").foregroundStyle(.secondary).imageScale(.small)
                    }
                }
            }
        }
    }

    // MARK: Update

    private var canUpgrade: Bool { model.canUpgrade(project) }

    private var updateButtonRow: some View {
        HStack {
            Spacer(minLength: 0)
            updateButton
        }
    }

    private var updateButton: some View {
        Button("Update with Claude", systemImage: "sparkles") {
            model.flow = .upgrade(project)
        }
        .buttonStyle(.glassProminent)
        .fixedSize()
        .disabled(!canUpgrade)
        .help(canUpgrade ? "Review the update, then apply it on a new branch" : blockedReason)
    }

    private var blockedReason: String {
        let precondition = model.upgradePrecondition(project)
        return switch precondition {
        case .notKitV3: "Only projects made with kit v3 can be updated."
        case .unresolvedConflicts: "Fix the conflicts left by an earlier update first."
        case .pinned: "To follow new releases again, unlock it from the project's Terminal."
        case .notOnMain: "This project can't be updated here because its kit commit isn't on main or it uses another template."
        default: precondition.reason ?? "Build the nuxt-saas CLI first"
        }
    }
}
