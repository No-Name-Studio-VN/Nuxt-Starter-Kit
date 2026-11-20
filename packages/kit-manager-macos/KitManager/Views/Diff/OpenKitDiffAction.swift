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

extension View {
    func kitDiffPresentation(_ request: Binding<DiffRequest?>? = nil) -> some View {
        modifier(KitDiffPresentation(request: request))
    }
}

/// A sheet needs its own presenter when the diff is opened from inside another sheet.
private struct KitDiffPresentation: ViewModifier {
    let request: Binding<DiffRequest?>?

    @State private var localRequest: DiffRequest?

    func body(content: Content) -> some View {
        let request = request ?? $localRequest
        content
            .environment(\.openKitDiff, OpenKitDiffAction { request.wrappedValue = $0 })
            .sheet(item: request) { request in
                KitDiffSheet(request: request)
                    .presentationSizing(.fitted)
            }
    }
}

extension DiffRequest {
    /// One kit change against its first parent; `modules` scopes it to a project's modules.
    static func change(_ commit: KitCommit, modules: Set<String>? = nil) -> DiffRequest {
        DiffRequest(title: commit.title, base: nil, head: commit.id, modules: modules)
    }
}
