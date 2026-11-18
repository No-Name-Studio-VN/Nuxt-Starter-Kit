import KitManagerCore
import SwiftUI

/// The changes in one kit release and the projects whose modules they touch.
struct ReleaseDetailView: View {
    let release: ReleaseSection
    let projects: [Project]

    @Environment(AppModel.self) private var model

    private var affectedProjects: [ProjectRow] {
        let modules = Set(release.commits.flatMap(\.modules))
        return projects.compactMap { project in
            guard let snapshot = model.snapshots[project.id], let state = snapshot.kitState,
                modules.contains(ModuleMapping.base) || !modules.isDisjoint(with: state.modules)
            else { return nil }
            return ProjectRow(project: project, snapshot: snapshot)
        }
    }

    var body: some View {
        let affected = affectedProjects
        Form {
            Section { header }
            changes("New", commits: release.commits.filter { $0.type == "feat" })
            changes("Fixes", commits: release.commits.filter { $0.type == "fix" })
            changes("Other Changes", commits: release.commits.filter { $0.type != "feat" && $0.type != "fix" })
            Section("Affects your projects") {
                if affected.isEmpty {
                    Text("None of your projects use the modules changed in this release.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(affected) { row in
                        KitProjectLink(row: row)
                    }
                }
            }
        }
        .formStyle(.grouped)
        .defaultScrollAnchor(.top)
        .navigationTitle(release.title)
    }

    private var header: some View {
        HStack(spacing: 14) {
            SettingsIcon(symbol: release.iconSymbol, color: release.iconColor, size: 56)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(release.title)
                    .font(.title2.bold())
                    .accessibilityAddTraits(.isHeader)
                if let date = release.displayDate {
                    Text(date)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 6)
    }

    @ViewBuilder
    private func changes(_ title: String, commits: [KitCommit]) -> some View {
        if !commits.isEmpty {
            Section(title) {
                ForEach(commits) { commit in commitRow(commit) }
            }
        }
    }

    private func commitRow(_ commit: KitCommit) -> some View {
        let modules = ChangelogGrouper.ordered(Array(commit.modules)).joined(separator: ", ")
        let age = commit.date.formatted(.relative(presentation: .named))
        return HStack(alignment: .firstTextBaseline, spacing: 10) {
            Text(commit.kindWord)
                .font(.caption.weight(.semibold))
                .foregroundStyle(commit.kindColor)
                .frame(minWidth: 44, alignment: .leading)
            if commit.breaking {
                Image(systemName: "exclamationmark.triangle")
                    .foregroundStyle(.red)
                    .help("Breaking change")
                    .accessibilityLabel("Breaking change")
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(commit.title)
                if !modules.isEmpty {
                    Text(modules)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .help(modules)
                        .accessibilityLabel("Modules: \(modules)")
                }
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 2)
        .help("Commit \(commit.id.prefix(7)) · \(age)")
        .accessibilityElement(children: .combine)
        .accessibilityValue(age)
    }
}
