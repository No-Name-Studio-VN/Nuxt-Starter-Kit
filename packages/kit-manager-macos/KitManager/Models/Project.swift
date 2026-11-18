import Foundation
import SwiftData

/// A folder the user added. Everything derived from it lives in a `ProjectSnapshot`; only the
/// user's choices and the cached preview and inspect results are stored.
@Model
final class Project {
    @Attribute(.unique) var id: UUID
    var path: String
    var displayName: String?
    var addedAt: Date
    var productionURL: String?
    /// JSON of `CachedResult<TransitionReport>`.
    var previewCache: Data?
    /// JSON of `CachedResult<InspectReport>`.
    var inspectCache: Data?

    init(path: String, displayName: String? = nil, addedAt: Date = .now) {
        self.id = UUID()
        self.path = path
        self.displayName = displayName
        self.addedAt = addedAt
    }

    var url: URL { URL(filePath: path) }
}
