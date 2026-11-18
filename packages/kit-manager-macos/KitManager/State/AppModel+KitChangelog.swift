import KitManagerCore

/// The kit changelog page: every commit since the oldest one a tracked project is on.
extension AppModel {
    /// Where the changelog starts, or nil when no project can be compared with main.
    var changelogAnchor: String? {
        ChangelogRange.oldestCommit(in: Array(snapshots.values))
    }

    /// The version label of the commit the changelog starts at, for the page's subtitle.
    func changelogAnchorLabel(_ anchor: String) -> String {
        let label = snapshots.values.first { $0.kitState?.commit == anchor }?.versionLabel
        return label ?? String(anchor.prefix(7))
    }

    /// Reads `anchor..origin/main` grouped under release tags. Never throws: a failure is a state
    /// the page shows.
    func loadKitChangelog(from anchor: String) async -> Loadable<[ReleaseSection]> {
        guard let mapping else {
            return .failed(
                cliStatus == .ready
                    ? "The kit's module list could not be read, so commits cannot be mapped to modules. Refresh to try again."
                    : "Commits are mapped to modules through the nuxt-saas CLI, which is not ready.")
        }
        do {
            return .loaded(try await kit.changelog(from: anchor, mapping: mapping), stale: false)
        } catch {
            return .failed(error.localizedDescription)
        }
    }
}
