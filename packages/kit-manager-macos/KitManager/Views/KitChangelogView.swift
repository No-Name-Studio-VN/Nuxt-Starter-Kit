import KitManagerCore
import SwiftUI

/// Every kit commit since the oldest one a tracked project is on, under the release tag it shipped in.
struct KitChangelogView: View {
    @Environment(AppModel.self) private var model

    @State private var state: Loadable<[ReleaseSection]> = .idle
    /// Bumped by "Try Again" so the load task restarts for an unchanged anchor.
    @State private var attempt = 0

    /// Reload when the starting point, main, the module catalogue or a retry changes.
    private struct LoadKey: Hashable {
        let anchor: String?
        let latestMain: String?
        let modules: Int
        let isFetchPending: Bool
        let attempt: Int
    }

    private var loadKey: LoadKey {
        LoadKey(
            anchor: model.changelogAnchor, latestMain: model.latestMain, modules: model.catalogue.count,
            isFetchPending: isFetchPending, attempt: attempt)
    }

    /// No fetch has finished yet, so a missing `origin/main` may still turn up.
    private var isFetchPending: Bool {
        model.fetchState == .idle || model.fetchState == .fetching
    }

    var body: some View {
        content
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("Kit")
            .task(id: loadKey) { await load() }
    }

    private func load() async {
        guard let anchor = model.changelogAnchor else {
            state = .idle
            return
        }
        guard model.latestMain != nil else {
            state = isFetchPending ? .loading : .failed("The kit has no main branch to read. Check the kit path in Settings and fetch again.")
            return
        }
        if state.value == nil { state = .loading }
        let result = await model.loadKitChangelog(from: anchor)
        if !Task.isCancelled { state = result }
    }

    @ViewBuilder
    private var content: some View {
        if let anchor = model.changelogAnchor {
            switch state {
            case .idle, .loading:
                VStack(spacing: 10) {
                    ProgressView().controlSize(.small)
                    Text("Reading the kit history…").font(.callout).foregroundStyle(.secondary)
                }
            case .failed(let message):
                ContentUnavailableView {
                    Label("Could not read the kit history", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try Again") { attempt += 1 }.buttonStyle(.glass)
                }
            case .loaded(let sections, _):
                if sections.isEmpty {
                    ContentUnavailableView(
                        "Nothing new in the kit", systemImage: "checkmark.circle",
                        description: Text("Every tracked project is on the latest kit commit."))
                } else {
                    list(sections, anchor: anchor)
                }
            }
        } else {
            ContentUnavailableView(
                "No tracked kit projects", systemImage: "shippingbox",
                description: Text(
                    "The changelog starts at the oldest kit commit a project is on. Add a kit v3 project made from the default template."
                ))
        }
    }

    private func list(_ sections: [ReleaseSection], anchor: String) -> some View {
        let count = sections.reduce(0) { $0 + $1.commits.count }
        return ScrollView {
            LazyVStack(alignment: .leading, spacing: 16, pinnedViews: []) {
                Text(
                    "\(count) \(count == 1 ? "commit" : "commits") since \(model.changelogAnchorLabel(anchor)), the oldest kit commit a project is on."
                )
                .font(.callout)
                .foregroundStyle(.secondary)
                ForEach(sections) { section in
                    sectionCard(section)
                }
            }
            .padding(20)
        }
    }

    private func sectionCard(_ section: ReleaseSection) -> some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(section.tag ?? "Unreleased")
                        .font(.headline)
                        .foregroundStyle(section.tag == nil ? Color.accentColor : Color.primary)
                    Text("\(section.commits.count)")
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                    Spacer(minLength: 8)
                    if let newest = section.commits.first {
                        Text(newest.date.formatted(date: .abbreviated, time: .omitted))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
                ForEach(section.commits) { commit in
                    CommitRow(commit: commit, showsModules: true)
                }
            }
        }
        .fixedSize(horizontal: false, vertical: true)
    }
}
