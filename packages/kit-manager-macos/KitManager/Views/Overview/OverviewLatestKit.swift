import KitManagerCore
import SwiftUI

/// The current kit version and a short excerpt from its changelog.
struct OverviewLatestKit: View {
    let latestLabel: String
    let anchor: String?

    @Environment(AppModel.self) private var model
    @State private var commits: [KitCommit] = []

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
                commitRow(commit)
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

    private func commitRow(_ commit: KitCommit) -> some View {
        let modules = ChangelogGrouper.ordered(Array(commit.modules)).joined(separator: ", ")
        return HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(commit.kindWord)
                .font(.caption.weight(.semibold))
                .foregroundStyle(commit.kindColor)
                .frame(minWidth: 42, alignment: .leading)
            if commit.breaking {
                Image(systemName: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .help("Breaking change")
                    .accessibilityLabel("Breaking change")
            }
            Text(commit.title)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .help(commit.title)
            if !modules.isEmpty {
                Text(modules)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .frame(maxWidth: 110, alignment: .trailing)
                    .help(modules)
            }
        }
        .accessibilityElement(children: .combine)
    }
}
