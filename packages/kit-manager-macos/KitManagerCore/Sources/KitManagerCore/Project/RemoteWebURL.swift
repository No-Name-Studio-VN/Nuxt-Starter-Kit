import Foundation

/// Repository links derived from git remotes, without remote credentials.
public enum RemoteWebURL {
    /// Keeps web transports and converts SSH or git transports to HTTPS. Local paths and SSH host
    /// aliases are not web destinations.
    public static func repository(fromRemote remote: String) -> URL? {
        let text = remote.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let remote = components(for: text), let scheme = remote.scheme?.lowercased(),
            let host = remote.host?.lowercased(), !host.isEmpty
        else { return nil }

        let isWeb = scheme == "http" || scheme == "https"
        if !isWeb {
            // A dotless SSH name may be an alias from ~/.ssh/config, not a website.
            guard scheme == "ssh" || scheme == "git", host.contains(".") || host.hasPrefix("[")
            else { return nil }
        }

        let encoded = remote.percentEncodedPath.split(separator: "/")
        var path = encoded.compactMap { $0.removingPercentEncoding }
        guard path.count == encoded.count, path.count >= 2, let name = path.popLast() else { return nil }
        path.append(name.hasSuffix(".git") ? String(name.dropLast(4)) : name)
        guard path.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." && !$0.contains("/") && !$0.contains("\\") })
        else { return nil }

        // Start fresh rather than carrying over user info, query parameters or fragments.
        var web = URLComponents()
        web.scheme = isWeb ? scheme : "https"
        web.host = host
        web.port = isWeb ? remote.port : nil
        web.path = "/" + path.joined(separator: "/")
        return web.url
    }

    public static func commit(_ sha: String, in repository: URL) -> URL {
        route("commit", in: repository).appending(component: sha)
    }

    public static func compare(from base: String, to head: String, in repository: URL) -> URL {
        route("compare", in: repository).appending(component: "\(base)...\(head)")
    }

    public static func hostName(of repository: URL) -> String {
        let host = repository.host() ?? ""
        switch host.lowercased() {
        case "github.com": return "GitHub"
        case "gitlab.com": return "GitLab"
        case "bitbucket.org": return "Bitbucket"
        default: return host
        }
    }

    private static func route(_ path: String, in repository: URL) -> URL {
        let root = repository.host()?.lowercased() == "gitlab.com" ? repository.appending(path: "-") : repository
        return root.appending(path: path)
    }

    private static func components(for remote: String) -> URLComponents? {
        if remote.contains("://") { return URLComponents(string: remote) }
        // SCP syntax: a colon must precede the first slash, or git treats the input as a local path.
        guard let colon = remote.firstIndex(of: ":") else { return nil }
        let authority = remote[..<colon]
        guard !authority.contains("/"), var parsed = URLComponents(string: "ssh://\(authority)"),
            parsed.query == nil, parsed.fragment == nil
        else { return nil }
        parsed.path = "/" + remote[remote.index(after: colon)...]
        return parsed
    }
}
