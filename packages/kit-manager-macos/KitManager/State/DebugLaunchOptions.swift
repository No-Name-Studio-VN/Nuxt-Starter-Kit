#if DEBUG
import Foundation

/// Debug builds only: `-KMDebugPage modules|whatsNew|attention` and `-KMDebugProject <name>` open a page or
/// project at launch. `-KMDebugSelect <name,name>` selects multiple projects.
/// `-KMDebugModule <id>` and `-KMDebugRelease <tag|Unreleased>` select a detail.
/// `-KMDebugSheet upgrade|migration|modules|scan|switcher` and `-KMDebugSettings YES` preview secondary surfaces.
/// `-KMDebugExpand YES` opens every disclosure and `-KMDebugHealth sourceControl|environment|website` opens a
/// Health tile's details. `-KMDebugProjectFolder <path>` opens a fixture in a temporary project list.
enum DebugLaunchOptions {
    static var projectFolder: String? { UserDefaults.standard.string(forKey: "KMDebugProjectFolder") }

    static var sheet: String? { UserDefaults.standard.string(forKey: "KMDebugSheet") }

    static var showsSettings: Bool { UserDefaults.standard.bool(forKey: "KMDebugSettings") }

    static var expandsDisclosures: Bool { UserDefaults.standard.bool(forKey: "KMDebugExpand") }

    static var healthSelection: String? { UserDefaults.standard.string(forKey: "KMDebugHealth") }

    static var moduleSelection: String? { UserDefaults.standard.string(forKey: "KMDebugModule") }

    static var releaseSelection: String? {
        let tag = UserDefaults.standard.string(forKey: "KMDebugRelease")
        return tag == "Unreleased" ? "" : tag
    }

    @MainActor
    static func apply(to model: AppModel, projects: [Project]) {
        let defaults = UserDefaults.standard
        switch defaults.string(forKey: "KMDebugPage") {
        case "modules": model.sidebar = .modules
        case "whatsNew": model.sidebar = .whatsNew
        case "attention": model.sidebar = .needsAttention
        default: break
        }
        if sheet == "switcher" { model.isSwitcherPresented = true }
        if let names = defaults.string(forKey: "KMDebugSelect") {
            let names = Set(names.split(separator: ",").map(String.init))
            model.sidebar = .allProjects
            model.selection = Set(projects.compactMap { project in
                let row = ProjectRow(project: project, snapshot: model.snapshots[project.id])
                return names.contains(row.name) ? project.id : nil
            })
            return
        }
        let project: Project?
        if projectFolder != nil {
            project = projects.first
        } else if let name = defaults.string(forKey: "KMDebugProject") {
            project = projects.first { ProjectRow(project: $0, snapshot: model.snapshots[$0.id]).name == name }
        } else {
            project = nil
        }
        guard let project else { return }
        model.openDetail(project)
        switch sheet {
        case "upgrade": model.flow = .upgrade(project)
        case "migration": model.flow = .migration(project)
        default: break
        }
    }
}
#endif
