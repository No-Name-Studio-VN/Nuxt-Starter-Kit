import Foundation

/// Whether the `nuxt-saas` CLI in a kit checkout can be run right now.
public enum CLIStatus: Equatable, Sendable {
    case ready
    case missingBuild
    case staleBuild
    case tooOld(found: String)
    case missingCheckout
}

public enum CLIFailure: Error, Equatable {
    /// The CLI ran and reported an error through its JSON envelope.
    case reported(message: String, kind: String)
    /// The CLI printed something that is not a JSON document (a Node crash, a missing `node`, a stale build).
    case unparsable(stderr: String, exitCode: Int32)
    /// `pnpm build` failed; its stderr is the useful part.
    case buildFailed(stderr: String, exitCode: Int32)
    case unsupportedSchema(Int)
    case projectComparisonUnsupported
    case projectComparisonClosed
    case unavailable(CLIStatus)
}

extension CLIFailure: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .reported(let message, _):
            return message
        case .unparsable(let stderr, let exitCode):
            let detail = stderr.isEmpty ? "no error output" : stderr
            return "The nuxt-saas CLI returned unreadable output (exit \(exitCode)): \(detail)"
        case .buildFailed(let stderr, let exitCode):
            let detail = stderr.isEmpty ? "no error output" : stderr
            return "Building the nuxt-saas CLI failed (pnpm build exited with \(exitCode)): \(detail)"
        case .unsupportedSchema(let schema):
            return "The nuxt-saas CLI returned JSON schema \(schema), which this app does not support."
        case .projectComparisonUnsupported:
            return "This nuxt-saas CLI cannot preview project files. Update the kit checkout and rebuild the CLI in Kit Manager Settings."
        case .projectComparisonClosed:
            return "This project comparison has closed. Reopen it to refresh the baseline."
        case .unavailable(let status):
            switch status {
            case .ready:
                return "The nuxt-saas CLI is ready."
            case .missingBuild:
                return "The nuxt-saas CLI has not been built yet."
            case .staleBuild:
                return "The nuxt-saas CLI build is older than its sources."
            case .tooOld(let found):
                return "The nuxt-saas CLI is version \(found), but \(NuxtSaasCLI.minimumVersion) or newer is required."
            case .missingCheckout:
                return "The kit checkout does not contain the nuxt-saas CLI."
            }
        }
    }
}
