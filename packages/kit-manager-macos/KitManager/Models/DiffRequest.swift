import Foundation

struct DiffRequest: Identifiable {
    let id: UUID
    let title: String
    let base: String?
    let head: String
    let modules: Set<String>?

    init(id: UUID = UUID(), title: String, base: String?, head: String, modules: Set<String>?) {
        self.id = id
        self.title = title
        self.base = base
        self.head = head
        self.modules = modules
    }
}
