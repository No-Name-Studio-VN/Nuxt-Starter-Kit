import Foundation

/// The parts of a `Project` that background work needs. `Project` itself is a main-actor model
/// object and cannot cross into a task group.
struct ProjectRef: Sendable {
    let id: UUID
    let url: URL
    let productionURL: String?
    let previewCache: Data?
    let inspectCache: Data?

    init(_ project: Project) {
        id = project.id
        url = project.url
        productionURL = project.productionURL
        previewCache = project.previewCache
        inspectCache = project.inspectCache
    }
}
