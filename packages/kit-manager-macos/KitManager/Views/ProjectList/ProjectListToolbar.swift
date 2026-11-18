import SwiftUI

/// Folder import and refresh controls for the project browser.
struct ProjectListToolbar: ToolbarContent {
    let isScanning: Bool
    @Binding var importRequest: ImportRequest?

    @Environment(AppModel.self) private var model

    var body: some ToolbarContent {
        ToolbarItemGroup {
            Button("Add Project", systemImage: "plus") { importRequest = .add }
                .help("Add project folders")
            Button("Scan Folder", systemImage: "folder.badge.questionmark") { importRequest = .scan }
                .help("Find projects inside a folder")
                .disabled(isScanning)
            Button("Refresh", systemImage: "arrow.clockwise") { Task { await model.refreshAll(force: true) } }
                .help("Refresh all projects (⌘R)")
                .disabled(model.isRefreshing)
        }
        if model.isRefreshing || isScanning {
            ToolbarItem(placement: .status) {
                ProgressView().controlSize(.small)
                    .accessibilityLabel(model.isRefreshing ? "Refreshing" : "Scanning for projects")
            }
        }
    }
}
