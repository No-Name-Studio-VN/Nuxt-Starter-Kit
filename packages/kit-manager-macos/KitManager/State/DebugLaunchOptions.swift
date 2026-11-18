#if DEBUG
import Foundation

/// Debug builds only: `-KMDebugPage modules|whatsNew|attention` and `-KMDebugProject <name>` open a page or
/// project at launch. `-KMDebugModule <id>` and `-KMDebugRelease <tag|Unreleased>` select a detail.
enum DebugLaunchOptions {
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
        guard let name = defaults.string(forKey: "KMDebugProject"),
            let project = projects.first(where: { ProjectRow(project: $0, snapshot: model.snapshots[$0.id]).name == name })
        else { return }
        model.openDetail(project)
    }
}
#endif
