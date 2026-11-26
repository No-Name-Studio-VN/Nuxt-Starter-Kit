import Foundation

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

extension KitModuleInfo {
    public func matchesSearch(_ query: String) -> Bool {
        query.isEmpty || title.localizedStandardContains(query)
            || id.localizedStandardContains(query) || description.localizedStandardContains(query)
    }
}

/// Orders rows by kit group and ancestry, retaining ancestors of search matches.
/// Without group metadata, rows stay flat and in order within each section.
public func groupModules<Item: Identifiable>(
    _ items: [Item], showsInternalSection: Bool = false, matching searchText: String = "",
    module: (Item) -> KitModuleInfo?
) -> [ModuleSection<Item>] where Item.ID == String {
    let rows = items.map { (item: $0, module: module($0)) }
    let hasGroupMetadata = rows.contains { $0.module?.groupPlacement != nil }
    let groups = Dictionary(grouping: rows) { row -> ModuleGroupPlacement in
        if showsInternalSection, let module = row.module, module.internal, module.group == nil {
            return .internalModules
        }
        return row.module?.groupPlacement ?? .ungrouped
    }
    let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    return groups.sorted { $0.key.index < $1.key.index }.compactMap { placement, members in
        let ids = Set(members.map(\.item.id))
        let children = Dictionary(grouping: members) { row in
            hasGroupMetadata ? row.module?.parent.flatMap { ids.contains($0) ? $0 : nil } : nil
        }
        func entries(_ parent: String?, depth: Int) -> [ModuleSection<Item>.Entry] {
            children[parent, default: []].flatMap { row -> [ModuleSection<Item>.Entry] in
                let descendants = entries(row.item.id, depth: depth + 1)
                let matches = row.module?.matchesSearch(query) ?? (query.isEmpty || row.item.id.localizedStandardContains(query))
                guard matches || !descendants.isEmpty else { return [] }
                return [.init(item: row.item, depth: depth)] + descendants
            }
        }
        let matches = entries(nil, depth: 0)
        return matches.isEmpty ? nil : ModuleSection(name: placement.name, entries: matches)
    }
}

/// Direct requirements only; alternatives and transitive dependencies do not count.
public func modulesRequiring(_ moduleID: String, in catalogue: [KitModuleInfo]) -> [KitModuleInfo] {
    catalogue.filter { $0.requires.contains(moduleID) }
}

/// Preview init's hard requirements and defaults without choosing any one-of alternatives.
public struct CreateModuleSelection {
    public let effective: Set<String>
    public let defaults: Set<String>
    public let requiredBy: [String: [String]]
    public let missingAlternatives: [KitModuleInfo]

    public init(report: ModulesReport, explicit: Set<String>) {
        let modules = report.modules
        let byID = Dictionary(uniqueKeysWithValues: modules.map { ($0.id, $0) })
        let defaults = Set(modules.filter(\.installByDefault).map(\.id))
        var effective: Set<String> = []
        var pending = Array(explicit.union(defaults))
        while let id = pending.popLast() {
            if let module = byID[id], effective.insert(id).inserted {
                pending.append(contentsOf: module.requires)
            }
        }

        let selectedModules = modules.filter { effective.contains($0.id) }
        var requiredBy: [String: [String]] = [:]
        for module in selectedModules {
            for required in Set(module.requires) {
                requiredBy[required, default: []].append(module.id)
            }
        }
        self.effective = effective
        self.defaults = defaults
        self.requiredBy = requiredBy
        self.missingAlternatives = selectedModules.filter {
            !$0.requiresOneOf.isEmpty && effective.isDisjoint(with: $0.requiresOneOf)
        }
    }
}
