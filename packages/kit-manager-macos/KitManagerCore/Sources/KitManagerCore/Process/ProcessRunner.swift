import Foundation

public struct ProcessResult: Sendable, Equatable {
    public let exitCode: Int32
    public let stdout: Data
    public let stderr: Data

    public init(exitCode: Int32, stdout: Data, stderr: Data) {
        self.exitCode = exitCode
        self.stdout = stdout
        self.stderr = stderr
    }
}

public enum ProcessError: Error, Equatable, LocalizedError {
    case timedOut
    case launchFailed(String)

    public var errorDescription: String? {
        switch self {
        case .timedOut: "The command timed out."
        case .launchFailed(let reason): "Could not start the command: \(reason)"
        }
    }
}

public protocol ProcessRunning: Sendable {
    func run(_ executable: String, _ arguments: [String], in directory: URL?, timeout: Duration) async throws -> ProcessResult
}

/// Runs `/usr/bin/env <executable> <arguments>` with the resolved login-shell environment,
/// so tools installed by Homebrew or version managers are found even for a Dock-launched app.
public struct ProcessRunner: ProcessRunning {
    private let environment: ShellEnvironment

    public init(environment: ShellEnvironment) {
        self.environment = environment
    }

    public func run(_ executable: String, _ arguments: [String], in directory: URL?, timeout: Duration) async throws -> ProcessResult {
        try await launch(
            executablePath: "/usr/bin/env",
            arguments: [executable] + arguments,
            environment: environment.variables,
            directory: directory,
            timeout: timeout
        )
    }
}

/// Launches a child process, reads both pipes concurrently so large output cannot fill a
/// pipe buffer and deadlock, and races the child against `timeout`.
func launch(
    executablePath: String,
    arguments: [String],
    environment: [String: String],
    directory: URL?,
    timeout: Duration
) async throws -> ProcessResult {
    let process = Process()
    process.executableURL = URL(filePath: executablePath)
    process.arguments = arguments
    process.environment = environment
    process.currentDirectoryURL = directory
    process.standardInput = FileHandle.nullDevice

    let stdoutPipe = Pipe()
    let stderrPipe = Pipe()
    process.standardOutput = stdoutPipe
    process.standardError = stderrPipe

    let exit = AsyncStream<Void>.makeStream()
    process.terminationHandler = { _ in exit.continuation.finish() }

    do {
        try process.run()
    } catch {
        try? stdoutPipe.fileHandleForReading.close()
        try? stderrPipe.fileHandleForReading.close()
        throw ProcessError.launchFailed(error.localizedDescription)
    }
    // Drop the parent's copies of the write ends, otherwise the readers never see EOF.
    try? stdoutPipe.fileHandleForWriting.close()
    try? stderrPipe.fileHandleForWriting.close()

    return try await withTaskCancellationHandler {
        try await withThrowingTaskGroup(of: Outcome.self) { group in
            group.addTask {
                async let stdout = readToEnd(stdoutPipe.fileHandleForReading)
                async let stderr = readToEnd(stderrPipe.fileHandleForReading)
                for await _ in exit.stream {}
                // Cancellation ends the loop early, while the child may still be running.
                try Task.checkCancellation()
                return .finished(
                    ProcessResult(exitCode: process.terminationStatus, stdout: await stdout, stderr: await stderr))
            }
            group.addTask {
                try await Task.sleep(for: timeout)
                terminate(process)
                return .timedOut
            }

            defer { group.cancelAll() }
            guard let first = try await group.next() else {
                throw ProcessError.launchFailed("no result")
            }
            switch first {
            case .finished(let result): return result
            case .timedOut: throw ProcessError.timedOut
            }
        }
    } onCancel: {
        terminate(process)
    }
}

private enum Outcome: Sendable {
    case finished(ProcessResult)
    case timedOut
}

private func readToEnd(_ handle: FileHandle) async -> Data {
    await withCheckedContinuation { continuation in
        DispatchQueue.global().async {
            continuation.resume(returning: (try? handle.readToEnd()) ?? Data())
        }
    }
}

/// Asks the child to stop, and force-kills it if it ignores SIGTERM.
private func terminate(_ process: Process) {
    guard process.isRunning else { return }
    process.terminate()
    let pid = process.processIdentifier
    Task.detached {
        try? await Task.sleep(for: .seconds(2))
        if process.isRunning {
            kill(pid, SIGKILL)
        }
    }
}
