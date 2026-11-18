import KitManagerCore
import SwiftUI

/// Kit changes since the project’s recorded commit, grouped by module.
struct ChangelogSection: View {
    let snapshot: ProjectSnapshot

    @Environment(AppModel.self) private var model
    @State private var showAll = false
    @State private var expanded: Set<String> = []

    private static let collapsedCount = 5

    private var installed: Set<String> { Set(snapshot.kitState?.modules ?? []) }

    var body: some View {
        let groups = ChangelogGrouper.groups(commits: snapshot.changelog, installed: installed, showAll: showAll)
        VStack(alignment: .leading, spacing: 14) {
            Toggle("Show all kit changes", isOn: $showAll)
                .toggleStyle(.switch)
                .controlSize(.small)
                .font(.caption)
            if snapshot.changelog.isEmpty {
                empty
            } else if groups.isEmpty {
                Text("None of the new kit changes touch the base or your modules.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(groups) { group in
                    groupView(group)
                }
            }
        }
    }

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
                commitRow(commit)
            }
            if group.commits.count > Self.collapsedCount {
                Button(
                    isExpanded ? "Show fewer" : "Show \(group.commits.count - Self.collapsedCount) more"
                ) {
                    if isExpanded { expanded.remove(group.id) } else { expanded.insert(group.id) }
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.accentColor)
                .font(.caption)
            }
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
                .font(.callout)
                .foregroundStyle(.primary)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
            if !modules.isEmpty {
                Text(modules)
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .help(modules)
            }
            Text(commit.date.formatted(.relative(presentation: .named)))
                .lineLimit(1)
                .fixedSize()
        }
        .font(.caption)
        .foregroundStyle(.secondary)
        .accessibilityElement(children: .combine)
    }
}
