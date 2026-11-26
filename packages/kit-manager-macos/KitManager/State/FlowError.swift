import Foundation

enum FlowError: LocalizedError {
    case projectUnknown
    case upgradePreviewChanged
    case notMigratable
    case invalidFolderName(String)
    case rollbackRefused(String)

    var errorDescription: String? {
        switch self {
        case .projectUnknown: "The project has not finished loading yet."
        case .upgradePreviewChanged: "The project or upgrade target changed. Preview it again before applying."
        case .notMigratable: "This project has nothing to migrate."
        case .invalidFolderName(let problem): problem
        case .rollbackRefused(let reason): reason
        }
    }
}
