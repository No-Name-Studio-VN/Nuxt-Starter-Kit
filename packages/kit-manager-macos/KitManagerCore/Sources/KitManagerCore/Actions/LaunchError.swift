import Foundation

public enum LaunchError: Error, Equatable, LocalizedError {
    /// `open` exited non-zero, for example when the target app is not installed.
    case openFailed(target: String, stderr: String)

    public var errorDescription: String? {
        switch self {
        case .openFailed(let target, let stderr):
            let detail = stderr.trimmingCharacters(in: .whitespacesAndNewlines)
            return detail.isEmpty ? "Could not open \(target)." : "Could not open \(target): \(detail)"
        }
    }
}
