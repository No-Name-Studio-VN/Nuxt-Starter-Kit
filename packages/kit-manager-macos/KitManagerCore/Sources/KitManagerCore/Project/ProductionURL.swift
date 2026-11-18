import Foundation

public enum ProductionURL {
    /// The wrangler routes win; the per-project override is the fallback (spec 2.7). The override
    /// may omit the scheme; anything that is not an http(s) URL with a host is ignored.
    public static func resolve(wrangler: WranglerInfo?, override: String?) -> URL? {
        if let url = wrangler?.productionURL { return url }
        guard var text = override?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else {
            return nil
        }
        if !text.contains("://") { text = "https://\(text)" }
        guard let url = URL(string: text), let scheme = url.scheme, ["http", "https"].contains(scheme),
            url.host() != nil
        else { return nil }
        return url
    }
}
