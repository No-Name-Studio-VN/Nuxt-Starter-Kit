import Foundation

public struct ShellEnvironment: Sendable, Equatable {
    public static let fallbackPath = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

    public let path: String

    public init(path: String) {
        self.path = path
    }

    /// The current process environment with `PATH` replaced by the resolved one.
    /// `GIT_TERMINAL_PROMPT=0` makes git fail instead of waiting on a credential prompt nobody can answer;
    /// `GIT_SSH_COMMAND` does the same for an ssh password or passphrase prompt.
    public var variables: [String: String] {
        var environment = ProcessInfo.processInfo.environment
        environment["PATH"] = path
        environment["GIT_TERMINAL_PROMPT"] = "0"
        environment["GIT_SSH_COMMAND"] = Self.batchSSHCommand(existing: environment["GIT_SSH_COMMAND"])
        return environment
    }

    /// `ssh -o BatchMode=yes`, appended to an ssh command the user already configured.
    static func batchSSHCommand(existing: String?) -> String {
        guard let existing, !existing.isEmpty else { return "ssh -o BatchMode=yes" }
        return "\(existing) -o BatchMode=yes"
    }

    /// Asks the user's login shell for its `PATH`, because a Dock-launched app inherits only a
    /// minimal one. Falls back to `fallbackPath` when the shell is missing, slow or prints nothing usable.
    public static func resolve(shell: String?, timeout: Duration = .seconds(5)) async -> ShellEnvironment {
        guard let shell, !shell.isEmpty else {
            return ShellEnvironment(path: fallbackPath)
        }
        // Markers separate the PATH from any noise rc files print on startup.
        let marker = "__KIT_MANAGER_PATH__"
        let script = "printf '%s%s%s' '\(marker)' \"$PATH\" '\(marker)'"
        do {
            let result = try await launch(
                executablePath: shell,
                arguments: ["-i", "-l", "-c", script],
                environment: ProcessInfo.processInfo.environment,
                directory: nil,
                timeout: timeout
            )
            guard result.exitCode == 0,
                let path = extractPath(from: String(decoding: result.stdout, as: UTF8.self), marker: marker)
            else {
                return ShellEnvironment(path: fallbackPath)
            }
            return ShellEnvironment(path: path)
        } catch {
            return ShellEnvironment(path: fallbackPath)
        }
    }

    private static func extractPath(from output: String, marker: String) -> String? {
        let parts = output.components(separatedBy: marker)
        guard parts.count >= 3 else { return nil }
        let path = parts[1]
        return path.isEmpty ? nil : path
    }
}
