import Foundation
import KitManagerCore

/// An error as the detail page shows it: a short message and, when there is one, the CLI's stderr
/// behind a "Show details" disclosure.
struct PresentedError: Equatable {
    let message: String
    let details: String?

    init(_ error: any Error) {
        switch error {
        case CLIFailure.unparsable(let stderr, let exitCode):
            message = "The nuxt-saas CLI returned unreadable output (exit \(exitCode))."
            details = stderr.isEmpty ? nil : stderr
        default:
            message = error.localizedDescription
            details = nil
        }
    }

    /// For a failure that only survives as text (a cached render failure). Long or multi-line text
    /// keeps its first line as the message and the whole text as the details.
    init(message text: String) {
        let limit = 240
        let firstLine = text.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: true).first.map(String.init) ?? text
        if firstLine.count == text.count && text.count <= limit {
            message = text
            details = nil
        } else {
            message = firstLine.count > limit ? Self.cut(firstLine, to: limit) : firstLine
            details = text
        }
    }

    /// Cuts at the last space before `limit` so a word is not split.
    private static func cut(_ text: String, to limit: Int) -> String {
        let head = text.prefix(limit)
        let end = head.lastIndex(of: " ") ?? head.endIndex
        return String(head[..<end]) + "…"
    }
}
