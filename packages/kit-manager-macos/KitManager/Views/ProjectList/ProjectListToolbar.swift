import SwiftUI

/// Folder import and refresh controls for the project browser.
struct ProjectListToolbar: ToolbarContent {
    let isScanning: Bool
    @Binding var importRequest: ImportRequest?

    @Environment(AppModel.self) private var model

    // Progress is an effect on the buttons' own symbols, and busy buttons stay enabled. Anything else changes the
    // toolbar's shape: a `.status` item moves this group to the other edge, and a disabled button or a
    // ProgressView label splits off into its own capsule. Refreshes are coalesced by the model, and a second
    // scan is ignored here.
    var body: some ToolbarContent {
        ToolbarItemGroup {
            Menu("Projects", systemImage: "plus") {
                Button("New Project…", action: model.beginProjectCreation)
                Button("Add Existing Project…") { importRequest = .add }
            }
            .help("Create a project or add an existing folder")
            Button("Scan Folder", systemImage: "folder.badge.questionmark") {
                if !isScanning { importRequest = .scan }
            }
            .symbolEffect(.pulse, isActive: isScanning)
            .help(isScanning ? "Scanning for projects…" : "Find projects inside a folder")
            .accessibilityValue(isScanning ? "Scanning" : "")
            Button("Refresh", systemImage: "arrow.clockwise") { Task { await model.refreshAll(force: true) } }
                .symbolEffect(.rotate, isActive: model.isRefreshing)
                .help(model.isRefreshing ? "Refreshing projects…" : "Refresh all projects (⌘R)")
                .accessibilityValue(model.isRefreshing ? "Refreshing" : "")
        }
    }
}
