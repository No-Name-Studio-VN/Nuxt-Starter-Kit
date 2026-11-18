import Foundation

public enum KitCheckout {
    /// True when `project` is the kit checkout itself. Compares standardized, symlink-resolved paths,
    /// so a trailing slash or a symlinked folder still matches. A nil `kitRoot` (no checkout configured)
    /// matches nothing.
    public static func isSource(_ project: URL, kitRoot: URL?) -> Bool {
        guard let kitRoot else { return false }
        return canonical(project) == canonical(kitRoot)
    }

    private static func canonical(_ url: URL) -> String {
        url.standardizedFileURL.resolvingSymlinksInPath().path
    }
}
