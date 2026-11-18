public enum ChangelogRange {
    /// The recorded kit commit of the tracked project that is furthest behind: the point the kit
    /// changelog starts from. Only kit v3 projects on the default template whose commit is on main
    /// count; kit-source folders and anything that cannot be compared do not.
    public static func oldestCommit(in snapshots: [ProjectSnapshot]) -> String? {
        var oldest: (commit: String, behind: Int)?
        for snapshot in snapshots where !snapshot.isKitSource && snapshot.usesDefaultTemplate {
            guard snapshot.availability == .onMain, let behind = snapshot.behind,
                let commit = snapshot.kitState?.commit
            else { continue }
            if oldest.map({ behind > $0.behind }) ?? true {
                oldest = (commit, behind)
            }
        }
        return oldest?.commit
    }
}
