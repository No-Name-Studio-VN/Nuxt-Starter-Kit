import KitManagerCore
import SwiftData
import SwiftUI

@main
struct KitManagerApp: App {
    /// The main window's ID, so the menu bar extra can bring it back.
    static let mainWindowID = "main"

    private let container: ModelContainer
    @State private var model: AppModel

    init() {
        AppSettings.seedDefaults()
        let (container, warning) = Self.makeContainer()
        self.container = container
        _model = State(initialValue: AppModel(context: container.mainContext, startupWarning: warning))
    }

    var body: some Scene {
        // A single window: opening it again from the menu bar brings the existing one forward.
        Window("Kit Manager", id: Self.mainWindowID) {
            RootView()
                .environment(model)
                .tint(Theme.amber)
        }
        .modelContainer(container)
        .defaultSize(width: 1180, height: 720)
        .commands {
            CommandGroup(after: .toolbar) {
                Button("Refresh All Projects") { Task { await model.refreshAll(force: true) } }
                    .keyboardShortcut("r")
                Button("Quick Switcher…") { model.isSwitcherPresented = true }
                    .keyboardShortcut("k")
                    .disabled(model.flow != nil)
            }
        }

        // Its own scene, so it does not inherit the window's environment: the model is passed in.
        MenuBarExtra {
            MenuBarContent(model: model)
        } label: {
            MenuBarLabel(count: model.attentionCount)
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView()
                .environment(model)
                .tint(Theme.amber)
        }
    }

    /// Falls back to an in-memory store so the app still opens when the on-disk one is unreadable.
    private static func makeContainer() -> (ModelContainer, String?) {
        do {
            // A named store, so it cannot collide with another app's `default.store`.
            return (try ModelContainer(for: Project.self, configurations: ModelConfiguration("KitManager")), nil)
        } catch {
            let message = "The project list could not be opened, so changes will not be saved: \(error.localizedDescription)"
            do {
                let memory = ModelConfiguration(isStoredInMemoryOnly: true)
                return (try ModelContainer(for: Project.self, configurations: memory), message)
            } catch {
                fatalError("Cannot create even an in-memory project store: \(error)")
            }
        }
    }
}
