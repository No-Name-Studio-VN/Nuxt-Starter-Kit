import Foundation

/// Maps changed paths to the kit modules they ship in (spec 2.5).
public struct ModuleMapping: Sendable {
    /// Module ID used for everything that is not owned by a module.
    public static let base = "base"

    private let exclude: [Glob]
    private let owners: [(id: String, globs: [Glob])]

    public init(exclude: [String], modules: [KitModuleInfo]) {
        self.exclude = exclude.map(Glob.init)
        owners = modules.map { (id: $0.id, globs: $0.rootFiles.map(Glob.init)) }
    }

    /// Excluded paths never ship and contribute nothing. `layers/<id>/…` belongs to `<id>`,
    /// a path matching a module's `rootFiles` belongs to that module, anything else to `base`.
    public func modules(for paths: [String]) -> Set<String> {
        var result: Set<String> = []
        for path in paths where !isExcluded(path) {
            result.insert(owner(of: path))
        }
        return result
    }

    /// Keeps paths shipped by the base kit or the given modules, in input order.
    public func paths(_ paths: [String], ownedBy modules: Set<String>) -> [String] {
        paths.filter { path in
            guard !isExcluded(path) else { return false }
            let owner = owner(of: path)
            return owner == Self.base || modules.contains(owner)
        }
    }

    private func isExcluded(_ path: String) -> Bool {
        exclude.contains { $0.matches(path) }
    }

    private func owner(of path: String) -> String {
        let parts = path.split(separator: "/", omittingEmptySubsequences: true)
        if parts.count >= 3, parts[0] == "layers" {
            return String(parts[1])
        }
        if let match = owners.first(where: { owner in owner.globs.contains { $0.matches(path) } }) {
            return match.id
        }
        return Self.base
    }
}
