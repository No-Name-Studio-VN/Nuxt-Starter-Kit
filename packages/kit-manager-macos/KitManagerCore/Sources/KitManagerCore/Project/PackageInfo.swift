import Foundation

public struct PackageInfo: Sendable, Equatable {
    public let name: String?
    /// `dependencies` and `devDependencies` combined.
    public let dependencies: Set<String>
    public let scripts: Set<String>

    public init(name: String?, dependencies: Set<String>, scripts: Set<String>) {
        self.name = name
        self.dependencies = dependencies
        self.scripts = scripts
    }
}

public enum PackageReader {
    /// Reads `package.json` in `root`; nil when it is absent or not a JSON object.
    public static func read(_ root: URL) -> PackageInfo? {
        guard let data = try? Data(contentsOf: root.appending(path: "package.json")),
            let object = try? JSONSerialization.jsonObject(with: data),
            let package = object as? [String: Any]
        else {
            return nil
        }
        let dependencies = keys(of: package["dependencies"]).union(keys(of: package["devDependencies"]))
        return PackageInfo(
            name: package["name"] as? String,
            dependencies: dependencies,
            scripts: keys(of: package["scripts"])
        )
    }

    private static func keys(of value: Any?) -> Set<String> {
        guard let dictionary = value as? [String: Any] else { return [] }
        return Set(dictionary.keys)
    }
}
