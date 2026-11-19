enum ModuleGroupPlacement: Hashable, Sendable {
    case named(String, index: Int)
    case ungrouped

    var name: String? {
        if case .named(let name, _) = self { return name }
        return nil
    }

    var index: Int {
        if case .named(_, let index) = self { return index }
        return .max
    }
}

public struct ModuleSection<Item: Identifiable>: Identifiable {
    public struct Entry: Identifiable {
        public let item: Item
        public let depth: Int

        public var id: Item.ID { item.id }
    }

    public let name: String?
    public let entries: [Entry]

    public var id: String? { name }
}

/// Orders the supplied rows by kit group, then by ancestry. Rows whose parent is missing or
/// filtered out become roots. Without group metadata, the input stays flat and in order.
public func groupModules<Item: Identifiable>(
    _ items: [Item], module: (Item) -> KitModuleInfo?
) -> [ModuleSection<Item>] where Item.ID == String {
    guard !items.isEmpty else { return [] }
    let rows = items.map { (item: $0, module: module($0)) }
    guard rows.contains(where: { $0.module?.groupPlacement != nil }) else {
        return [ModuleSection(name: nil, entries: items.map { .init(item: $0, depth: 0) })]
    }

    let groups = Dictionary(grouping: rows) { $0.module?.groupPlacement ?? .ungrouped }
    return groups.sorted { $0.key.index < $1.key.index }.map { placement, members in
        let ids = Set(members.map(\.item.id))
        let children = Dictionary(grouping: members) { row in
            row.module?.parent.flatMap { ids.contains($0) ? $0 : nil }
        }
        var entries: [ModuleSection<Item>.Entry] = []
        func visit(_ parent: String?, depth: Int) {
            for row in children[parent, default: []] {
                entries.append(.init(item: row.item, depth: depth))
                visit(row.item.id, depth: depth + 1)
            }
        }
        visit(nil, depth: 0)
        return ModuleSection(name: placement.name, entries: entries)
    }
}
