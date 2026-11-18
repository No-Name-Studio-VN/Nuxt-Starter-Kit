import KitManagerCore
import SwiftUI

/// Kit commits since the project's recorded commit, grouped by module. Only commits that touch
/// the base or an installed module show until "Show all kit commits" is on.
struct ChangelogSection: View {
    let snapshot: ProjectSnapshot

    @Environment(AppModel.self) private var model
    @State private var showAll = false
    @State private var expanded: Set<String> = []

    private static let collapsedCount = 5

    private var installed: Set<String> { Set(snapshot.kitState?.modules ?? []) }

    var body: some View {
        let groups = ChangelogGrouper.groups(commits: snapshot.changelog, installed: installed, showAll: showAll)
        GlassCard("What's new") {
            VStack(alignment: .leading, spacing: 14) {
                if snapshot.changelog.isEmpty {
                    empty
                } else if groups.isEmpty {
                    Text("None of the new kit commits touch the base or your modules.")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(groups) { group in
                        groupView(group)
                    }
                }
            }
        } trailing: {
            Toggle("Show all kit commits", isOn: $showAll)
                .toggleStyle(.switch)
                .controlSize(.small)
                .font(.caption)
        }
    }

    @ViewBuilder
    private var empty: some View {
        if model.cliStatus == .ready {
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Reading the kit history…").font(.callout).foregroundStyle(.secondary)
            }
        } else {
            Text("The changelog is mapped to modules through the nuxt-saas CLI, which is not ready.")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
    }

    private func groupView(_ group: ChangelogGroup) -> some View {
        let isExpanded = expanded.contains(group.id)
        let shown = isExpanded ? group.commits : Array(group.commits.prefix(Self.collapsedCount))
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(group.module ?? "not shipped")
                    .font(.callout.weight(.semibold))
                    .foregroundStyle(group.module == nil ? Color.secondary : Color.primary)
                Text("\(group.commits.count)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            ForEach(shown) { commit in
                commitRow(commit)
            }
            if group.commits.count > Self.collapsedCount {
                Button(
                    isExpanded ? "Show fewer" : "Show \(group.commits.count - Self.collapsedCount) more"
                ) {
                    if isExpanded { expanded.remove(group.id) } else { expanded.insert(group.id) }
                }
                .buttonStyle(.plain)
                    .foregroundStyle(Theme.amber)
                .font(.caption)
            }
        }
    }

    private func commitRow(_ commit: KitCommit) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            if let type = commit.type {
                Text(commit.scope.map { "\(type)(\($0))" } ?? type)
                    .font(.caption.monospaced())
                    .foregroundStyle(commit.breaking ? Theme.red : Color.secondary)
                    .lineLimit(1)
                    .frame(minWidth: 52, alignment: .leading)
            }
            Text(commit.title)
                .font(.callout)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            Text(commit.date.formatted(.relative(presentation: .named)))
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .accessibilityElement(children: .combine)
    }
}
