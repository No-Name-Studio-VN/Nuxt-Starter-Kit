import KitManagerCore
import SwiftUI

/// Where the project stands against the kit, what an upgrade would change, and the (not yet wired)
/// Upgrade with Claude button.
struct UpgradeSection: View {
    let project: Project
    let snapshot: ProjectSnapshot

    @Environment(AppModel.self) private var model

    private var status: ProjectStatus { ProjectStatus(snapshot: snapshot) }

    /// The CLI's own answer once `inspect` has loaded, otherwise what `.nuxt-saas.json` recorded.
    private var unresolvedConflicts: [String] {
        snapshot.inspect.value?.conflicts.unresolved ?? snapshot.kitState?.conflicts ?? []
    }

    private var isPreviewing: Bool { snapshot.preview == .loading }

    var body: some View {
        GlassCard("Upgrade") {
            VStack(alignment: .leading, spacing: 14) {
                headline
                if !unresolvedConflicts.isEmpty { unresolved }
                if showsPreview {
                    preview
                    upgradeButton
                }
            }
        } trailing: {
            // Nothing to preview when the project is already up to date.
            if showsPreview {
                Button {
                    Task { await model.loadPreview(project) }
                } label: {
                    Label(snapshot.preview.value == nil ? "Preview" : "Preview again", systemImage: "arrow.clockwise")
                }
                .quietGlassButton()
                .disabled(isPreviewing || model.cliStatus != .ready)
                .help(model.cliStatus == .ready ? "Render the upgrade again" : "Build the nuxt-saas CLI first")
            }
        }
    }

    // MARK: Headline

    @ViewBuilder
    private var headline: some View {
        switch status {
        case .behind(let count, _):
            HStack(alignment: .firstTextBaseline, spacing: 16) {
                versionPath
                Spacer(minLength: 12)
                VStack(alignment: .trailing, spacing: 0) {
                    Text("\(count)")
                        .font(.system(size: 34, weight: .semibold).monospacedDigit())
                        .foregroundStyle(Theme.amber)
                    Text(count == 1 ? "commit behind" : "commits behind")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("\(count) commits behind")
            }
        case .upToDate:
            Label("Up to date with the latest kit", systemImage: "checkmark.circle.fill")
                .font(.callout.weight(.medium))
                .foregroundStyle(Theme.green)
            versionText(snapshot.versionLabel, fallback: snapshot.kitState?.commit).font(.title3)
        case .unresolvedConflicts:
            if snapshot.behind != nil { versionPath }
        case .pinned(let ref):
            note("Upgrades follow the pinned ref \(ref), not main. Previews render that ref from its repository, so they need network access.")
        case .otherTemplate:
            note("This project was generated from another template, so there is no kit version to compare. Previews use the recorded template and need network access.")
        case .commitNotOnMain(let sha):
            note("Kit commit \(sha) is not on main in your kit checkout, so the version and commits behind are unknown. Previews fetch it from the recorded template.")
        case .checkFailed(let message):
            FailureView(message: message)
        case .checking:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Checking against the latest kit…").font(.callout).foregroundStyle(.secondary)
            }
        case .missing, .invalid, .kitSource, .needsMigration:
            EmptyView()
        }
    }

    private var versionPath: some View {
        HStack(spacing: 8) {
            versionText(snapshot.versionLabel, fallback: snapshot.kitState?.commit)
            Image(systemName: "arrow.right").foregroundStyle(.secondary).accessibilityLabel("to")
            versionText(model.latestLabel, fallback: model.latestMain)
        }
        .font(.title3)
    }

    private func versionText(_ label: String?, fallback: String?) -> some View {
        Group {
            if let label {
                Text(label).fontWeight(.medium)
            } else if let fallback {
                Text(String(fallback.prefix(7))).font(.body.monospaced())
            } else {
                Text("—").foregroundStyle(.secondary)
            }
        }
    }

    private func note(_ text: String) -> some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var unresolved: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(
                "\(unresolvedConflicts.count) unresolved conflict\(unresolvedConflicts.count == 1 ? "" : "s") from an earlier upgrade",
                systemImage: "exclamationmark.triangle.fill"
            )
            .font(.callout.weight(.medium))
            .foregroundStyle(Theme.red)
            ForEach(unresolvedConflicts, id: \.self) { path in
                Text(path).font(.caption.monospaced()).lineLimit(1).truncationMode(.middle)
            }
            note("Resolve the conflict markers in these files before upgrading again.")
        }
    }

    // MARK: Preview

    private var showsPreview: Bool {
        if case .upToDate = status { return false }
        return true
    }

    @ViewBuilder
    private var preview: some View {
        switch snapshot.preview {
        case .idle:
            note(
                model.cliStatus == .ready
                    ? "No preview yet. Preview renders the upgrade without changing anything."
                    : "Upgrade previews need the built nuxt-saas CLI.")
        case .loading:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Previewing upgrade…").font(.callout).foregroundStyle(.secondary)
            }
        case .failed(let message):
            FailureView(message: message)
        case .loaded(let report, let stale):
            VStack(alignment: .leading, spacing: 10) {
                if report.upToDate == true {
                    note("Nothing to upgrade.")
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

    // MARK: Action

    private var upgradeButton: some View {
        HStack(spacing: 10) {
            Button {
            } label: {
                Label("Upgrade with Claude", systemImage: "sparkles")
            }
            .buttonStyle(.glassProminent)
            .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
            .disabled(true)
            .help("Available in the next step")
            Text("Available in the next step")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}
