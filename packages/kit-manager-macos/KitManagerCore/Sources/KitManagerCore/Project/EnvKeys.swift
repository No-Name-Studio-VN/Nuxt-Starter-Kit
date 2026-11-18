import Foundation

/// Reads variable names from dotenv files. Values are never kept.
public enum EnvKeys {
    public static func keys(in text: String) -> Set<String> {
        let line = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/
        var keys: Set<String> = []
        for row in text.split(whereSeparator: \.isNewline) {
            if let match = row.firstMatch(of: line) {
                keys.insert(String(match.1))
            }
        }
        return keys
    }

    public static func check(_ root: URL) -> EnvCheck {
        let example = try? Data(contentsOf: root.appending(path: ".env.example"))
        let env = try? Data(contentsOf: root.appending(path: ".env"))

        let exampleKeys = example.map { keys(in: String(decoding: $0, as: UTF8.self)) } ?? []
        let envKeys = env.map { keys(in: String(decoding: $0, as: UTF8.self)) } ?? []
        return EnvCheck(
            hasExample: example != nil,
            hasEnv: env != nil,
            missing: exampleKeys.subtracting(envKeys).sorted()
        )
    }
}
