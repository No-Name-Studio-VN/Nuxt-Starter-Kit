import Foundation

enum FlowError: LocalizedError {
    case projectUnknown
    case notMigratable
    case invalidFolderName(String)
    case rollbackRefused(String)

    var errorDescription: String? {
        switch self {
        case .projectUnknown: "The project has not finished loading yet."
        case .notMigratable: "This project has nothing to migrate."
        case .invalidFolderName(let problem): problem
        case .rollbackRefused(let reason): reason
        }
    }
}
