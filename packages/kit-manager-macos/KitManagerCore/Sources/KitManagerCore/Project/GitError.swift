import Foundation

public enum GitError: Error, Equatable, LocalizedError {
    /// A git command exited non-zero. Includes "not a git repository".
    case commandFailed(arguments: [String], exitCode: Int32, stderr: String)
    case invalidBranchName(String)
    /// A revision that git would read as an option (leading dash).
    case invalidRevision(String)

    public var errorDescription: String? {
        switch self {
        case .commandFailed(let arguments, let exitCode, let stderr):
            let detail = stderr.trimmingCharacters(in: .whitespacesAndNewlines)
            let command = "git \(arguments.joined(separator: " "))"
            return detail.isEmpty ? "\(command) exited with \(exitCode)" : "\(command) failed: \(detail)"
        case .invalidBranchName(let name):
            return "Invalid branch name: \(name)"
        case .invalidRevision(let revision):
            return "Invalid revision: \(revision)"
        }
    }
}
