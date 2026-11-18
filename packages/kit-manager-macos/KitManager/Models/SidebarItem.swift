enum SidebarItem: Hashable, CaseIterable {
    case allProjects
    case needsAttention
    case modules
    case kit

    var title: String {
        switch self {
        case .allProjects: "All Projects"
        case .needsAttention: "Needs Attention"
        case .modules: "Modules"
        case .kit: "Kit"
        }
    }

    var symbol: String {
        switch self {
        case .allProjects: "square.stack.3d.up"
        case .needsAttention: "exclamationmark.triangle"
        case .modules: "square.grid.3x3"
        case .kit: "shippingbox"
        }
    }
}
