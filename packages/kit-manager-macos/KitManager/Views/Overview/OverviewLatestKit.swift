import KitManagerCore
import SwiftUI

/// The current kit version and a short excerpt from its changelog.
struct OverviewLatestKit: View {
    let latestLabel: String
    let anchor: String?
    let onOpen: ((KitCommit) -> Void)?

    @Environment(AppModel.self) private var model
    @State private var commits: [KitCommit] = []

    init(latestLabel: String, anchor: String?, onOpen: ((KitCommit) -> Void)? = nil) {
        self.latestLabel = latestLabel
        self.anchor = anchor
        self.onOpen = onOpen
    }

    var body: some View {
        Section {
            versionRow
                .task(id: model.latestMain) {
                    commits = []
                    guard let anchor, model.latestMain != nil else { return }
                    let releases = await model.loadKitChangelog(from: anchor)
                    guard !Task.isCancelled, let sections = releases.value else { return }
                    commits = Array(sections.lazy.flatMap(\.commits).prefix(3))
                }
            ForEach(commits) { commit in
                KitChangeRow(commit: commit, onOpen: onOpen.map { open in { open(commit) } })
            }
        } header: {
            Text("Latest Kit")
        }
    }

    private var versionRow: some View {
        HStack(spacing: 12) {
            SettingsIcon(symbol: "shippingbox.fill", color: .brown, size: 34)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 1) {
                Text("Kit \(latestLabel)").font(.headline)
                KitFetchStatus(state: model.fetchState)
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            Button("See All Changes") { model.sidebar = .whatsNew }
                .buttonStyle(.bordered)
                .fixedSize()
        }
    }
}
