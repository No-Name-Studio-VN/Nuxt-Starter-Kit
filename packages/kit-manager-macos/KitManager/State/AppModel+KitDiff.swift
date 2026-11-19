import KitManagerCore

extension AppModel {
    /// Reads a local kit diff, optionally limited to the paths shipped by a project's modules.
    func loadKitDiff(_ request: DiffRequest, allFiles: Bool, maxBytes: Int = 1_500_000) async -> Loadable<KitDiff> {
        let repository = kit
        do {
            let paths: [String]?
            if !allFiles, let modules = request.modules {
                guard let mapping else {
                    return .failed("The kit's module list is unavailable. Switch to All files to see the unfiltered diff.")
                }
                let changed = try await repository.changedPaths(from: request.base, to: request.head)
                paths = await Task.detached(priority: .userInitiated) { mapping.paths(changed, ownedBy: modules) }.value
            } else {
                paths = nil
            }
            try Task.checkCancellation()
            let diff = try await repository.diff(from: request.base, to: request.head, limitedTo: paths, maxBytes: maxBytes)
            return .loaded(diff, stale: false)
        } catch {
            return .failed(error.localizedDescription)
        }
    }
}
