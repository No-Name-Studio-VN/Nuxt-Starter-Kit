import Foundation

/// Opens Terminal, VS Code and Finder through `open`, so Core needs neither AppKit nor Apple Events permission.
public struct Launcher: Sendable {
    private static let scriptSuffix = ".command"
    private static let promptSuffix = ".prompt.md"
    private static let openTimeout = Duration.seconds(10)

    private let scriptsDirectory: URL
    private let environment: ShellEnvironment
    private let runner: any ProcessRunning

    public init(scriptsDirectory: URL, environment: ShellEnvironment, runner: any ProcessRunning) {
        self.scriptsDirectory = scriptsDirectory
        self.environment = environment
        self.runner = runner
    }

    /// The zsh script a `.command` file runs: the resolved PATH, the project directory, the command,
    /// then a login shell so the Terminal window stays usable afterwards.
    public static func script(directory: URL, command: LaunchCommand, path: String) -> String {
        var lines = [
            "#!/bin/zsh",
            "export PATH=\(shellQuote(path))",
            "cd \(shellQuote(directory.path)) || exit 1",
        ]
        switch command {
        case .shell:
            break
        case .claude:
            lines.append("claude")
        case .claudeContinue:
            lines.append("claude --continue")
        case .claudePrompt(let file):
            lines.append("claude \"$(cat \(shellQuote(file.path)))\"")
        }
        lines.append("exec \"$SHELL\" -l")
        return lines.joined(separator: "\n") + "\n"
    }

    public func openTerminal(at directory: URL, command: LaunchCommand) async throws {
        let contents = Self.script(directory: directory, command: command, path: environment.path)
        let file = try write(contents, suffix: Self.scriptSuffix, permissions: 0o755)
        try await open(["-a", "Terminal", file.path], target: "Terminal")
    }

    public func writePrompt(_ text: String) throws -> URL {
        try write(text, suffix: Self.promptSuffix, permissions: 0o600)
    }

    public func openInVSCode(_ url: URL) async throws {
        try await open(["-b", "com.microsoft.VSCode", url.path], target: "VS Code")
    }

    public func revealInFinder(_ url: URL) async throws {
        try await open(["-R", url.path], target: "Finder")
    }

    /// Deletes the scripts and prompts this launcher created (UUID-named `.command` and `.prompt.md`
    /// files) that are older than `olderThan`. Anything else in the directory is left alone.
    public func removeStaleFiles(olderThan: Duration = .seconds(86_400)) {
        let fileManager = FileManager.default
        let cutoff = Date(timeIntervalSinceNow: -Double(olderThan.components.seconds))
        guard
            let files = try? fileManager.contentsOfDirectory(
                at: scriptsDirectory, includingPropertiesForKeys: [.contentModificationDateKey])
        else { return }
        for file in files where isOwnFile(file.lastPathComponent) {
            let modified = try? file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
            if let modified, modified < cutoff {
                try? fileManager.removeItem(at: file)
            }
        }
    }

    private func isOwnFile(_ name: String) -> Bool {
        for suffix in [Self.scriptSuffix, Self.promptSuffix] where name.hasSuffix(suffix) {
            return UUID(uuidString: String(name.dropLast(suffix.count))) != nil
        }
        return false
    }

    private func write(_ text: String, suffix: String, permissions: Int) throws -> URL {
        let fileManager = FileManager.default
        try fileManager.createDirectory(at: scriptsDirectory, withIntermediateDirectories: true)
        let file = scriptsDirectory.appending(path: UUID().uuidString + suffix)
        try Data(text.utf8).write(to: file)
        try fileManager.setAttributes([.posixPermissions: permissions], ofItemAtPath: file.path)
        return file
    }

    private func open(_ arguments: [String], target: String) async throws {
        let result = try await runner.run("open", arguments, in: nil, timeout: Self.openTimeout)
        guard result.exitCode == 0 else {
            throw LaunchError.openFailed(target: target, stderr: String(decoding: result.stderr, as: UTF8.self))
        }
    }
}
