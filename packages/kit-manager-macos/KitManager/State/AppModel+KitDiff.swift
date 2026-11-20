import KitManagerCore

extension AppModel {
    /// Reads a local kit diff, optionally limited to the paths shipped by a project's modules.
    func loadKitDiff(_ request: DiffRequest, allFiles: Bool, maxBytes: Int = 1_500_000) async -> Loadable<KitDiffPreview> {
        let repository = kit
        do {
            if let path = request.focusPath,
                let patch = try await repository.focusedDiff(from: request.base, to: request.head, path: path, maxBytes: maxBytes)
            {
                return .loaded(KitDiffPreview(patch: patch, isFocused: true), stale: false)
            }

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
            let patch = try await repository.diff(from: request.base, to: request.head, limitedTo: paths, maxBytes: maxBytes)
            return .loaded(KitDiffPreview(patch: patch, isFocused: false), stale: false)
        } catch {
            return .failed(error.localizedDescription)
        }
    }
}
