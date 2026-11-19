import KitManagerCore
import SwiftUI

/// Kit changes since the project's recorded commit, with breaking changes first.
struct ChangelogSection: View {
    let snapshot: ProjectSnapshot
    let onOpenChange: ((KitCommit) -> Void)?
    let onViewAll: (() -> Void)?

    @Environment(AppModel.self) private var model
    @State private var showAll = false
    @State private var isExpanded = false

    private static let collapsedCount = 5

    init(snapshot: ProjectSnapshot, onOpenChange: ((KitCommit) -> Void)? = nil, onViewAll: (() -> Void)? = nil) {
        self.snapshot = snapshot
        self.onOpenChange = onOpenChange
        self.onViewAll = onViewAll
    }

    var body: some View {
        let installed = Set(snapshot.kitState?.modules ?? [])
        let commits = ChangelogGrouper.visibleCommits(snapshot.changelog, installed: installed, showAll: showAll)
        VStack(alignment: .leading, spacing: 8) {
            controls
            if snapshot.changelog.isEmpty {
                empty
            } else if commits.isEmpty {
                Text("None of the new kit changes touch the base or your modules.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            } else {
                changes(commits)
            }
        }
        .padding(.top, 4)
        .onChange(of: showAll) { isExpanded = false }
    }

    @ViewBuilder
    private var controls: some View {
        if let onViewAll {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 8) {
                    scopePicker
                    Spacer(minLength: 8)
                    viewChangesButton(action: onViewAll)
                }
                VStack(alignment: .leading, spacing: 8) {
                    scopePicker
                    viewChangesButton(action: onViewAll)
                }
            }
        } else {
            scopePicker
        }
    }

    private var scopePicker: some View {
        Picker("Change scope", selection: $showAll) {
            Text("Your modules").tag(false)
            Text("All").tag(true)
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .controlSize(.small)
        .fixedSize()
    }

    private func viewChangesButton(action: @escaping () -> Void) -> some View {
        Button("View code changes", systemImage: "chevron.left.forwardslash.chevron.right", action: action)
            .buttonStyle(.glass)
            .controlSize(.small)
            .fixedSize()
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

    private func changes(_ commits: [KitCommit]) -> some View {
        let shown = isExpanded ? commits[...] : commits.prefix(Self.collapsedCount)
        let breaking = shown.prefix(while: \.breaking)
        return VStack(alignment: .leading, spacing: 2) {
            if !breaking.isEmpty {
                VStack(spacing: 2) {
                    ForEach(breaking, content: changeRow)
                }
                .background(.red.opacity(0.08), in: .rect(cornerRadius: 8))
                .overlay {
                    RoundedRectangle(cornerRadius: 8).strokeBorder(.red.opacity(0.20))
                        .allowsHitTesting(false)
                }
            }
            ForEach(shown.dropFirst(breaking.count), content: changeRow)
            if commits.count > Self.collapsedCount {
                Button(isExpanded ? "Show fewer" : "Show \(commits.count - Self.collapsedCount) more") {
                    isExpanded.toggle()
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.accentColor)
                .font(.caption)
                .padding(.top, 4)
            }
        }
    }

    private func changeRow(_ commit: KitCommit) -> some View {
        KitChangeRow(commit: commit, onOpen: onOpenChange.map { open in { open(commit) } })
    }
}
