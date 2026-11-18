import KitManagerCore

/// The filters and kit sections available from the main window sidebar.
enum SidebarItem: Hashable {
    case allProjects, needsAttention, status(StatusFilter), modules, whatsNew

    static let projectItems: [SidebarItem] = [.allProjects, .needsAttention] + StatusFilter.allCases.map(Self.status)

    var isProjectList: Bool {
        Self.projectItems.contains(self)
    }

    var title: String {
        switch self {
        case .allProjects: "All Projects"
        case .needsAttention: "Needs Attention"
        case .status(.upToDate): "Up to Date"
        case .status(.updates): "Updates Available"
        case .status(.notOnKit): "Not on the Kit"
        case .modules: "Modules"
        case .whatsNew: "What's New"
        }
    }

    var symbol: String {
        switch self {
        case .allProjects: "square.stack.3d.up"
        case .needsAttention: "exclamationmark.circle"
        case .status(.upToDate): "checkmark.circle"
        case .status(.updates): "arrow.down.circle"
        case .status(.notOnKit): "arrow.triangle.merge"
        case .modules: "puzzlepiece.extension"
        case .whatsNew: "sparkles"
        }
    }
}
