import Foundation

enum ModuleChangeError: LocalizedError {
    case dirtyTree
    case notApplied
    case projectUnknown

    var errorDescription: String? {
        switch self {
        case .dirtyTree: "Commit or stash your changes first."
        case .notApplied: "Only an applied module change can be handed to Claude."
        case .projectUnknown: "The project has not finished loading yet."
        }
    }
}
