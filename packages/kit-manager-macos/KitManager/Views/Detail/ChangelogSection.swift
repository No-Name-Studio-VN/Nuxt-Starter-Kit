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

    /// Nothing to list. The snapshot is built before this card shows, so there is no loading state:
    /// the cause is a failed `git log`, a missing module catalogue, or genuinely nothing.
    @ViewBuilder
    private var empty: some View {
        if let failure = snapshot.changelogFailure {
            FailureView(message: failure)
        } else if model.catalogue.isEmpty {
            Text(
                model.cliStatus == .ready
                    ? "The kit's module list could not be read, so commits cannot be mapped to modules. Refresh to try again."
                    : "The changelog is mapped to modules through the nuxt-saas CLI, which is not ready."
            )
            .font(.callout)
            .foregroundStyle(.secondary)
        } else {
            Text("No kit changes since this commit.").font(.callout).foregroundStyle(.secondary)
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
                CommitRow(commit: commit)
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
}
