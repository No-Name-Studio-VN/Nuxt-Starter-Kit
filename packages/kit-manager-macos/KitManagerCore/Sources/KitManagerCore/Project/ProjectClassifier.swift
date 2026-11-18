import Foundation

public enum ProjectClassifier {
    private static let supportedStateVersion = 3

    public static func classify(_ root: URL) -> ProjectKind {
        let fileManager = FileManager.default
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: root.path, isDirectory: &isDirectory), isDirectory.boolValue else {
            return .missing
        }

        let stateURL = root.appending(path: ".nuxt-saas.json")
        if fileManager.fileExists(atPath: stateURL.path) {
            switch readState(at: stateURL) {
            case .success(let state): return .kitV3(state)
            case .failure(let failure): return .invalidState(failure.message)
            }
        }
        if fileManager.fileExists(atPath: root.appending(path: ".nuxt-saas/manifest.json").path) {
            return .kitLegacy
        }
        if PackageReader.read(root)?.dependencies.contains("nuxt") == true {
            return .nuxt
        }
        return .other
    }

    private struct StateFailure: Error {
        let message: String
    }

    /// Mirrors the CLI's own validation: `version` is 3 and `commit` is 40 lowercase hex characters.
    private static func readState(at url: URL) -> Result<KitState, StateFailure> {
        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            return .failure(StateFailure(message: "Cannot read .nuxt-saas.json: \(error.localizedDescription)"))
        }
        let state: KitState
        do {
            state = try JSONDecoder().decode(KitState.self, from: data)
        } catch let error as DecodingError {
            return .failure(StateFailure(message: describe(error)))
        } catch {
            return .failure(StateFailure(message: "Invalid .nuxt-saas.json: \(error.localizedDescription)"))
        }
        guard state.version == supportedStateVersion else {
            return .failure(
                StateFailure(
                    message: "Invalid .nuxt-saas.json: version is \(state.version), expected \(supportedStateVersion)"))
        }
        guard isFullCommitHash(state.commit) else {
            return .failure(
                StateFailure(message: "Invalid .nuxt-saas.json: commit must be 40 lowercase hex characters"))
        }
        return .success(state)
    }

    private static func isFullCommitHash(_ value: String) -> Bool {
        value.utf8.count == 40 && value.utf8.allSatisfy { ($0 >= 0x30 && $0 <= 0x39) || ($0 >= 0x61 && $0 <= 0x66) }
    }

    private static func describe(_ error: DecodingError) -> String {
        func path(_ context: DecodingError.Context) -> String {
            context.codingPath.map(\.stringValue).joined(separator: ".")
        }
        switch error {
        case .keyNotFound(let key, let context):
            let location = (context.codingPath + [key]).map(\.stringValue).joined(separator: ".")
            return "Invalid .nuxt-saas.json: missing \(location)"
        case .typeMismatch(_, let context), .valueNotFound(_, let context), .dataCorrupted(let context):
            let location = path(context)
            return location.isEmpty
                ? "Invalid .nuxt-saas.json: \(context.debugDescription)"
                : "Invalid .nuxt-saas.json: \(location): \(context.debugDescription)"
        @unknown default:
            return "Invalid .nuxt-saas.json: \(error.localizedDescription)"
        }
    }
}
