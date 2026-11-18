import Foundation

public struct WranglerInfo: Sendable, Equatable {
    public let workerName: String?
    /// `route` first, then every `routes[]` pattern.
    public let routes: [String]
    public let productionURL: URL?

    public init(workerName: String?, routes: [String], productionURL: URL?) {
        self.workerName = workerName
        self.routes = routes
        self.productionURL = productionURL
    }

    /// Reads `wrangler.jsonc`, falling back to `wrangler.json`. Nil when neither exists or parses.
    public static func read(_ root: URL) -> WranglerInfo? {
        for fileName in ["wrangler.jsonc", "wrangler.json"] {
            guard let data = try? Data(contentsOf: root.appending(path: fileName)) else { continue }
            guard let object = try? JSONSerialization.jsonObject(with: data, options: .json5Allowed),
                let config = object as? [String: Any]
            else {
                return nil
            }
            return WranglerInfo(config: config)
        }
        return nil
    }

    private init(config: [String: Any]) {
        var patterns: [String] = []
        var customDomain: String?

        if let pattern = Self.pattern(of: config["route"]) {
            patterns.append(pattern)
        }
        if let entries = config["routes"] as? [Any] {
            for entry in entries {
                guard let pattern = Self.pattern(of: entry) else { continue }
                patterns.append(pattern)
                if customDomain == nil, let object = entry as? [String: Any], object["custom_domain"] as? Bool == true {
                    customDomain = pattern
                }
            }
        }

        workerName = config["name"] as? String
        routes = patterns
        productionURL = (customDomain ?? patterns.first).flatMap(Self.url(forPattern:))
    }

    /// A route is either a pattern string or an object with a `pattern` key.
    private static func pattern(of route: Any?) -> String? {
        if let string = route as? String { return string }
        if let object = route as? [String: Any] { return object["pattern"] as? String }
        return nil
    }

    private static func url(forPattern pattern: String) -> URL? {
        var host = pattern
        if host.hasSuffix("/*") { host.removeLast(2) }
        // A wildcard host does not name one reachable site.
        guard !host.isEmpty, !host.contains("*") else { return nil }
        return URL(string: host.contains("://") ? host : "https://\(host)")
    }
}
