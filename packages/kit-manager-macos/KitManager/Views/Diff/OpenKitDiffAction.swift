import KitManagerCore
import SwiftUI

/// Presents the code changes sheet from anywhere in the main window.
struct OpenKitDiffAction {
    let open: (DiffRequest) -> Void

    func callAsFunction(_ request: DiffRequest) { open(request) }
}

extension EnvironmentValues {
    /// Nil outside the main window, where change rows stay plain text.
    @Entry var openKitDiff: OpenKitDiffAction?
}

extension DiffRequest {
    /// One kit change against its first parent; `modules` scopes it to a project's modules.
    static func change(_ commit: KitCommit, modules: Set<String>? = nil) -> DiffRequest {
        DiffRequest(title: commit.title, base: nil, head: commit.id, modules: modules)
    }
}
