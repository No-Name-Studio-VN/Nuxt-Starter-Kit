#if DEBUG
import Foundation

/// Debug builds only: `-KMDebugPage modules|whatsNew|attention` and `-KMDebugProject <name>` open a page or
/// project at launch. `-KMDebugSelect <name,name>` selects multiple projects.
/// `-KMDebugModule <id>` and `-KMDebugRelease <tag|Unreleased>` select a detail.
/// `-KMDebugSheet upgrade|migration|modules|scan|switcher` and `-KMDebugSettings YES` preview secondary surfaces.
/// `-KMDebugSearch <text>` fills the sidebar search.
/// `-KMDebugDiff <sha|a..b>` opens the code changes sheet. `-KMDebugDiffModules <id,id>` scopes the diff;
/// `-KMDebugDiffLayout side` and `-KMDebugDiffMaxBytes <bytes>` preview an alternate layout and truncation.
enum DebugLaunchOptions {
    static var searchText: String? { UserDefaults.standard.string(forKey: "KMDebugSearch") }

    static var sheet: String? { UserDefaults.standard.string(forKey: "KMDebugSheet") }

    static var showsSettings: Bool { UserDefaults.standard.bool(forKey: "KMDebugSettings") }

    static var moduleSelection: String? { UserDefaults.standard.string(forKey: "KMDebugModule") }

    static var releaseSelection: String? {
        let tag = UserDefaults.standard.string(forKey: "KMDebugRelease")
        return tag == "Unreleased" ? "" : tag
    }

    static var diffRequest: DiffRequest? {
        let defaults = UserDefaults.standard
        guard let revision = defaults.string(forKey: "KMDebugDiff"), !revision.isEmpty else { return nil }
        let modules = defaults.string(forKey: "KMDebugDiffModules").map { Set($0.split(separator: ",").map(String.init)) }
        let bounds = revision.components(separatedBy: "..")
        switch bounds.count {
        case 1:
            return DiffRequest(title: "Code Changes", base: nil, head: revision, modules: modules)
        case 2 where bounds.allSatisfy({ !$0.isEmpty }):
            return DiffRequest(title: "Kit Update Changes", base: bounds[0], head: bounds[1], modules: modules)
        default:
            return nil
        }
    }

    static var diffLayout: DiffLayout {
        UserDefaults.standard.string(forKey: "KMDebugDiffLayout") == "side" ? .sideBySide : .unified
    }

    static var diffMaxBytes: Int? {
        guard let value = UserDefaults.standard.string(forKey: "KMDebugDiffMaxBytes"), let bytes = Int(value), bytes >= 0 else {
            return nil
        }
        return bytes
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
        guard let name = defaults.string(forKey: "KMDebugProject"),
            let project = projects.first(where: { ProjectRow(project: $0, snapshot: model.snapshots[$0.id]).name == name })
        else { return }
        model.openDetail(project)
        switch sheet {
        case "upgrade": model.flow = .upgrade(project)
        case "migration": model.flow = .migration(project)
        default: break
        }
    }
}
#endif
