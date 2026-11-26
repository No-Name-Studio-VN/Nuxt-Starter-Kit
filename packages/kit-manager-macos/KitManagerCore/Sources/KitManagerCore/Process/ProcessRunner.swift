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
    case outputLimitExceeded
    case launchFailed(String)

    public var errorDescription: String? {
        switch self {
        case .timedOut: "The command timed out."
        case .outputLimitExceeded: "The command exceeded its output limit."
        case .launchFailed(let reason): "Could not start the command: \(reason)"
        }
    }
}

public protocol ProcessRunning: Sendable {
    func run(_ executable: String, _ arguments: [String], in directory: URL?, timeout: Duration) async throws -> ProcessResult
    func run(_ executable: String, _ arguments: [String], in directory: URL?, timeout: Duration, outputLimit: Int) async throws
        -> ProcessResult
}

extension ProcessRunning {
    public func run(_ executable: String, _ arguments: [String], in directory: URL?, timeout: Duration, outputLimit: Int) async throws
        -> ProcessResult
    {
        // A runner that cannot cap its pipe reads must not silently buffer the entire output.
        throw ProcessError.launchFailed("This process runner does not support an output limit.")
    }
}

/// Runs `/usr/bin/env <executable> <arguments>` with the resolved login-shell environment,
/// so tools installed by Homebrew or version managers are found even for a Dock-launched app.
public struct ProcessRunner: ProcessRunning {
    private let environment: ShellEnvironment

    public init(environment: ShellEnvironment) {
        self.environment = environment
    }

    public func run(_ executable: String, _ arguments: [String], in directory: URL?, timeout: Duration) async throws -> ProcessResult {
        try await runProcess(executable, arguments, in: directory, timeout: timeout, outputLimit: nil)
    }

    public func run(_ executable: String, _ arguments: [String], in directory: URL?, timeout: Duration, outputLimit: Int) async throws
        -> ProcessResult
    {
        try await runProcess(executable, arguments, in: directory, timeout: timeout, outputLimit: max(0, outputLimit))
    }

    private func runProcess(
        _ executable: String, _ arguments: [String], in directory: URL?, timeout: Duration, outputLimit: Int?
    ) async throws -> ProcessResult {
        try await launch(
            executablePath: "/usr/bin/env",
            arguments: [executable] + arguments,
            environment: environment.variables,
            directory: directory,
            timeout: timeout,
            outputLimit: outputLimit
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
    timeout: Duration,
    outputLimit: Int? = nil
) async throws -> ProcessResult {
    try Task.checkCancellation()
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
            group.addTask { .stdout(try await readToEnd(stdoutPipe.fileHandleForReading, limit: outputLimit)) }
            group.addTask { .stderr(try await readToEnd(stderrPipe.fileHandleForReading, limit: outputLimit)) }
            group.addTask {
                for await _ in exit.stream {}
                try Task.checkCancellation()
                return .exited(process.terminationStatus)
            }
            group.addTask {
                try await Task.sleep(for: timeout)
                throw ProcessError.timedOut
            }

            defer { group.cancelAll() }
            var stdout: Data?
            var stderr: Data?
            var exitCode: Int32?
            do {
                while let outcome = try await group.next() {
                    switch outcome {
                    case .stdout(let data): stdout = data
                    case .stderr(let data): stderr = data
                    case .exited(let code): exitCode = code
                    }
                    if let stdout, let stderr, let exitCode {
                        return ProcessResult(exitCode: exitCode, stdout: stdout, stderr: stderr)
                    }
                }
                throw ProcessError.launchFailed("no result")
            } catch {
                terminate(process)
                throw error
            }
        }
    } onCancel: {
        terminate(process)
    }
}

private enum Outcome: Sendable {
    case stdout(Data)
    case stderr(Data)
    case exited(Int32)
}

private func readToEnd(_ handle: FileHandle, limit: Int?) async throws -> Data {
    try await withCheckedThrowingContinuation { continuation in
        DispatchQueue.global().async {
            defer { try? handle.close() }
            guard let limit else {
                continuation.resume(returning: (try? handle.readToEnd()) ?? Data())
                return
            }
            do {
                var data = Data()
                while let chunk = try handle.read(upToCount: min(limit - data.count, 64 * 1024 - 1) + 1), !chunk.isEmpty {
                    guard chunk.count <= limit - data.count else { throw ProcessError.outputLimitExceeded }
                    data.append(chunk)
                }
                continuation.resume(returning: data)
            } catch {
                continuation.resume(throwing: error)
            }
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
