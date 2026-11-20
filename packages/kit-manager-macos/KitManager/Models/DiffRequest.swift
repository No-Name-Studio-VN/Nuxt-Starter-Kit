import Foundation
import KitManagerCore

struct DiffRequest: Identifiable {
    let id: UUID
    let title: String
    let base: String?
    let head: String
    let modules: Set<String>?
    let focusPath: String?

    init(id: UUID = UUID(), title: String, base: String?, head: String, modules: Set<String>?, focusPath: String? = nil) {
        self.id = id
        self.title = title
        self.base = base
        self.head = head
        self.modules = modules
        self.focusPath = focusPath
    }
}

struct KitDiffPreview: Sendable, Equatable {
    let patch: KitDiff
    let isFocused: Bool
}
