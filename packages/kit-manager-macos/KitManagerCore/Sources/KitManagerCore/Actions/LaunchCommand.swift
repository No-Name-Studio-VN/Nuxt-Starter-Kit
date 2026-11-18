import Foundation

public enum LaunchCommand: Sendable, Equatable {
    case shell
    case claude
    case claudeContinue
    case claudePrompt(file: URL)
}
