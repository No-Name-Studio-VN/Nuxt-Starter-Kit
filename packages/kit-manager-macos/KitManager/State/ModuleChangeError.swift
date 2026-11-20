import Foundation

enum ModuleChangeError: LocalizedError {
    case notApplied
    case projectUnknown

    var errorDescription: String? {
        switch self {
        case .notApplied: "The nuxt-saas CLI did not apply the module change."
        case .projectUnknown: "The project has not finished loading yet."
        }
    }
}
