import Foundation

/// Keys and defaults for the settings stored in `UserDefaults`. Views bind them with `@AppStorage`.
enum AppSettings {
    static let kitPathKey = "kitPath"
    static let fetchIntervalKey = "fetchIntervalMinutes"
    static let defaultFetchIntervalMinutes = 30
    static let fetchIntervalChoices = [10, 15, 30, 60, 120, 240]

    static var kitPath: String {
        UserDefaults.standard.string(forKey: kitPathKey) ?? ""
    }

    static var fetchIntervalMinutes: Int {
        let stored = UserDefaults.standard.integer(forKey: fetchIntervalKey)
        return stored > 0 ? stored : defaultFetchIntervalMinutes
    }

    /// `~/Documents/GitHub/Nuxt-Starter-Kit`, when that folder holds the CLI package.
    static var defaultKitPath: String? {
        let candidate = FileManager.default.homeDirectoryForCurrentUser
            .appending(path: "Documents/GitHub/Nuxt-Starter-Kit")
        let cli = candidate.appending(path: "packages/create-nuxt-saas")
        return FileManager.default.fileExists(atPath: cli.path) ? candidate.path : nil
    }

    /// Fills the kit path on first run so the user is not asked when the usual checkout exists.
    static func seedDefaults() {
        guard kitPath.isEmpty, let path = defaultKitPath else { return }
        UserDefaults.standard.set(path, forKey: kitPathKey)
    }
}
