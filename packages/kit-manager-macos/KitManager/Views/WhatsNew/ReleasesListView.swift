import KitManagerCore
import SwiftUI

/// The center column for browsing kit releases.
struct ReleasesListView: View {
    @Binding var selection: String?
    @Binding var releases: Loadable<[ReleaseSection]>

    @Environment(AppModel.self) private var model
    @State private var attempt = 0

    var body: some View {
        ZStack { content }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("What's New")
            .navigationSplitViewColumnWidth(min: 260, ideal: 300)
            .background {
                // Main can be known before the catalogue or the oldest project commit is ready.
                if model.canLoadKitChangelog, let anchor = model.changelogAnchor {
                    Color.clear
                        .task(id: model.latestMain) { await load(from: anchor) }
                        .id(anchor)
                        .id(attempt)
                }
            }
            .onChange(of: model.changelogAnchor, initial: true) { _, anchor in
                if anchor == nil {
                    releases = .idle
                    selection = nil
                }
            }
    }

    @ViewBuilder
    private var content: some View {
        if let anchor = model.changelogAnchor {
            if !model.canLoadKitChangelog {
                if !model.hasCheckedKit || model.fetchState == .fetching {
                    progress
                } else {
                    failure(unavailableReason) { Task { await model.fetchKit() } }
                }
            } else {
                switch releases {
                case .idle, .loading:
                    progress
                case .failed(let message):
                    failure(message) { attempt += 1 }
                case .loaded(let sections, _):
                    if sections.isEmpty {
                        ContentUnavailableView(
                            "Nothing new in the kit", systemImage: "checkmark.circle",
                            description: Text("Every tracked project is on the latest kit commit."))
                    } else {
                        list(sections, anchor: anchor)
                    }
                }
            }
        } else {
            ContentUnavailableView(
                "No tracked kit projects", systemImage: "shippingbox",
                description: Text(
                    "Add a kit v3 project made from the default template to see what's changed since its version."))
        }
    }

    private var progress: some View {
        ProgressView("Reading the kit history…")
            .controlSize(.small)
    }

    private var unavailableReason: String {
        if model.latestMain == nil {
            return "The kit has no main branch to read. Check the kit path in Settings and try again."
        }
        return model.cliStatus == .ready
            ? "Couldn't read the kit's module list to match changes to modules."
            : "The nuxt-saas CLI must be ready to match changes to modules."
    }

    private func failure(_ message: String, retry: @escaping () -> Void) -> some View {
        ContentUnavailableView {
            Label("Couldn't read the kit history", systemImage: "exclamationmark.triangle")
        } description: {
            Text(message)
        } actions: {
            Button("Try Again", action: retry).buttonStyle(.glass)
        }
    }

    private func load(from anchor: String) async {
        guard model.canLoadKitChangelog, !Task.isCancelled else { return }
        let main = model.latestMain
        if releases.value == nil { releases = .loading }
        let result = await model.loadKitChangelog(from: anchor)
        guard !Task.isCancelled, model.latestMain == main, model.canLoadKitChangelog,
            model.changelogAnchor == anchor
        else { return }
        if let selection, result.value?.contains(where: { $0.id == selection }) != true {
            self.selection = nil
        }
        releases = result
    }

    private func list(_ sections: [ReleaseSection], anchor: String) -> some View {
        let count = sections.reduce(0) { $0 + $1.commits.count }
        return List(selection: $selection) {
            Section {
                ForEach(sections) { release in releaseRow(release) }
            } footer: {
                Text("\(count) \(count == 1 ? "commit" : "commits") since \(model.changelogAnchorLabel(anchor))")
                    .help("The changelog starts at the oldest kit commit a project is on.")
            }
        }
        .accessibilityLabel("Releases")
        .navigationSubtitle(sections.count == 1 ? "1 release" : "\(sections.count) releases")
    }

    private func releaseRow(_ release: ReleaseSection) -> some View {
        let count = release.commits.count
        return HStack(spacing: 10) {
            SettingsIcon(symbol: release.iconSymbol, color: release.iconColor, size: 34)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline) {
                    Text(release.title)
                        .fontWeight(.semibold)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    if let date = release.displayDate {
                        Text(date)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                Text(count == 1 ? "1 commit" : "\(count) commits")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 3)
        .accessibilityElement(children: .combine)
        .accessibilityHint("Shows the changes in this release")
        .tag(release.id)
    }
}
