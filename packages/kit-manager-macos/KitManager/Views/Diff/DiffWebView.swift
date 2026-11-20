import SwiftUI
import WebKit

enum DiffLayout: String {
    case unified = "line-by-line"
    case sideBySide = "side-by-side"
}

/// An isolated web view that only loads the bundled diff renderer.
struct DiffWebView: NSViewRepresentable {
    let text: String
    let layout: DiffLayout
    let showsFileList: Bool
    let onRender: (String?) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onRender: onRender) }

    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.underPageBackgroundColor = .windowBackgroundColor
        webView.navigationDelegate = context.coordinator
        context.coordinator.load(in: webView)
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        context.coordinator.update(text: text, layout: layout, showsFileList: showsFileList, in: webView)
    }

    @MainActor
    final class Coordinator: NSObject, WKNavigationDelegate {
        private let assetURL = Bundle.main.url(forResource: "diff", withExtension: "html", subdirectory: "Diff")
        private let onRender: (String?) -> Void
        private var didAllowInitialLoad = false
        private var pageIsReady = false
        private var isRendering = false
        private var pending: Render?
        private var submitted: Render?

        private struct Render: Equatable {
            let text: String
            let layout: DiffLayout
            let showsFileList: Bool
        }

        init(onRender: @escaping (String?) -> Void) { self.onRender = onRender }

        func load(in webView: WKWebView) {
            guard let assetURL else {
                Task { onRender("The bundled diff renderer is missing.") }
                return
            }
            webView.loadFileURL(assetURL, allowingReadAccessTo: assetURL.deletingLastPathComponent())
        }

        func update(text: String, layout: DiffLayout, showsFileList: Bool, in webView: WKWebView) {
            pending = Render(text: text, layout: layout, showsFileList: showsFileList)
            render(in: webView)
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard !didAllowInitialLoad, navigationAction.navigationType == .other,
                navigationAction.targetFrame?.isMainFrame == true,
                let assetURL, navigationAction.request.url == assetURL
            else { return .cancel }
            didAllowInitialLoad = true
            return .allow
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation?) {
            pageIsReady = true
            render(in: webView)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation?, withError error: Error) {
            onRender(error.localizedDescription)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation?, withError error: Error) {
            onRender(error.localizedDescription)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            onRender("The diff renderer stopped unexpectedly. Close and reopen the preview to try again.")
        }

        private func render(in webView: WKWebView) {
            guard pageIsReady, !isRendering, let pending, pending != submitted else { return }
            submitted = pending
            isRendering = true
            // The patch is untrusted data. Never embed it in the script or the page URL.
            webView.callAsyncJavaScript(
                "window.renderDiff(patch, layout, showsFileList)",
                arguments: ["patch": pending.text, "layout": pending.layout.rawValue, "showsFileList": pending.showsFileList],
                in: nil, in: .page
            ) { [weak self, weak webView] result in
                guard let self, let webView else { return }
                isRendering = false
                if self.pending == pending {
                    switch result {
                    case .success: onRender(nil)
                    case .failure(let error): onRender(error.localizedDescription)
                    }
                }
                render(in: webView)
            }
        }
    }
}
