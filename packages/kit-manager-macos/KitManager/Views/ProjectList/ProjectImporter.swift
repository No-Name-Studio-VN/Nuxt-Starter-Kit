import KitManagerCore
import SwiftUI
import UniformTypeIdentifiers

/// Handles the shared project folder picker and scan results.
struct ProjectImporter: ViewModifier {
    @Binding var request: ImportRequest?
    @Binding var isScanning: Bool

    @Environment(AppModel.self) private var model
    @State private var isImporting = false
    @State private var scanCandidates: [ScanCandidate]?

    func body(content: Content) -> some View {
        content
            .onChange(of: request, initial: true) {
                isImporting = request != nil
            }
            .fileImporter(
                isPresented: $isImporting,
                allowedContentTypes: [.folder], allowsMultipleSelection: request == .add,
                onCompletion: handleImport,
                onCancellation: { request = nil }
            )
            #if DEBUG
            .task {
                if DebugLaunchOptions.sheet == "scan" {
                    scanCandidates = await model.scan(folder: URL(filePath: AppSettings.kitPath).deletingLastPathComponent())
                }
            }
            #endif
            .sheet(
                isPresented: Binding(get: { scanCandidates != nil }, set: { if !$0 { scanCandidates = nil } })
            ) {
                ScanSheet(candidates: scanCandidates ?? [], knownPaths: model.knownPaths)
            }
    }

    private func handleImport(_ result: Result<[URL], any Error>) {
        let purpose = request
        request = nil
        switch result {
        case .failure(let error):
            // Cancelling the picker is not an error.
            if !isUserCancellation(error) { model.errorMessage = error.localizedDescription }
        case .success(let urls):
            switch purpose {
            case .add:
                model.add(urls: urls)
            case .scan:
                guard let folder = urls.first else { return }
                isScanning = true
                Task {
                    let found = await model.scan(folder: folder)
                    isScanning = false
                    scanCandidates = found
                }
            case .locate(let project):
                if let url = urls.first { model.relocate(project, to: url) }
            case nil:
                break
            }
        }
    }

    private func isUserCancellation(_ error: any Error) -> Bool {
        let nsError = error as NSError
        return nsError.domain == NSCocoaErrorDomain && nsError.code == NSUserCancelledError
    }
}
