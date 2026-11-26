/// A flow sheet the window should present. Held on `AppModel` so the table's menu, the context menu
/// and the detail page all open the same sheet from one place.
enum FlowRequest: Identifiable {
    case newProject
    case upgrade(Project)
    case migration(Project)

    var id: String {
        switch self {
        case .newProject: "new-project"
        case .upgrade(let project): "upgrade-\(project.id)"
        case .migration(let project): "migration-\(project.id)"
        }
    }
}
