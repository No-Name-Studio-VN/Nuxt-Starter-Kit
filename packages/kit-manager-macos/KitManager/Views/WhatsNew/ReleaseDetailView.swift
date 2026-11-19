import KitManagerCore
import SwiftUI

/// The changes in one kit release and the projects whose modules they touch.
struct ReleaseDetailView: View {
    let release: ReleaseSection
    let projects: [Project]
    let onOpen: ((KitCommit) -> Void)?
    let onViewAll: (() -> Void)?

    @Environment(AppModel.self) private var model

    init(
        release: ReleaseSection, projects: [Project], onOpen: ((KitCommit) -> Void)? = nil,
        onViewAll: (() -> Void)? = nil
    ) {
        self.release = release
        self.projects = projects
        self.onOpen = onOpen
        self.onViewAll = onViewAll
    }

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

    @ViewBuilder
    private var header: some View {
        if let onViewAll {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 12) {
                    releaseInfo
                    Spacer(minLength: 0)
                    viewChangesButton(action: onViewAll)
                }
                VStack(alignment: .leading, spacing: 8) {
                    releaseInfo
                    viewChangesButton(action: onViewAll)
                }
            }
        } else {
            releaseInfo
        }
    }

    private var releaseInfo: some View {
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

    private func viewChangesButton(action: @escaping () -> Void) -> some View {
        Button("View code changes", systemImage: "chevron.left.forwardslash.chevron.right", action: action)
            .buttonStyle(.glass)
            .controlSize(.small)
            .fixedSize()
    }

    @ViewBuilder
    private func changes(_ title: String, commits: [KitCommit]) -> some View {
        if !commits.isEmpty {
            Section(title) {
                ForEach(commits) { commit in
                    KitChangeRow(commit: commit, onOpen: onOpen.map { open in { open(commit) } })
                }
            }
        }
    }
}
