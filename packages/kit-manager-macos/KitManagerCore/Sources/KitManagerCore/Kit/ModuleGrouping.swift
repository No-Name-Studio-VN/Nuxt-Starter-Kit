enum ModuleGroupPlacement: Hashable, Sendable {
    case named(String, index: Int)
    case ungrouped
    case internalModules

    var name: String? {
        switch self {
        case .named(let name, _): name
        case .ungrouped: nil
        case .internalModules: "Internal"
        }
    }

    var index: Int {
        switch self {
        case .named(_, let index): index
        case .ungrouped: .max - 1
        case .internalModules: .max
        }
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
/// filtered out become roots. Without group metadata, rows stay flat and in order within each section.
public func groupModules<Item: Identifiable>(
    _ items: [Item], showsInternalSection: Bool = false, module: (Item) -> KitModuleInfo?
) -> [ModuleSection<Item>] where Item.ID == String {
    let rows = items.map { (item: $0, module: module($0)) }
    let hasGroupMetadata = rows.contains { $0.module?.groupPlacement != nil }
    let groups = Dictionary(grouping: rows) { row -> ModuleGroupPlacement in
        if showsInternalSection, let module = row.module, module.internal, module.group == nil {
            return .internalModules
        }
        return row.module?.groupPlacement ?? .ungrouped
    }
    return groups.sorted { $0.key.index < $1.key.index }.map { placement, members in
        guard hasGroupMetadata else {
            return ModuleSection(name: placement.name, entries: members.map { .init(item: $0.item, depth: 0) })
        }
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

/// Direct requirements only; alternatives and transitive dependencies do not count.
public func modulesRequiring(_ moduleID: String, in catalogue: [KitModuleInfo]) -> [KitModuleInfo] {
    catalogue.filter { $0.requires.contains(moduleID) }
}
