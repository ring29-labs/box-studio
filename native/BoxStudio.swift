import SwiftUI
import AppKit
import WebKit
import UniformTypeIdentifiers

@_silgen_name("box_calculate") func boxCalculate(_ input: UnsafePointer<CChar>) -> UnsafeMutablePointer<CChar>
@_silgen_name("box_free") func boxFree(_ ptr: UnsafeMutablePointer<CChar>)

// The desktop and browser share the guided interface and Rust quote engine.
// In the desktop, WebKit calls the native Rust library directly; all files stay local.
@MainActor final class StudioBridge: NSObject, ObservableObject, WKScriptMessageHandler, WKNavigationDelegate {
    weak var webView: WKWebView?
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "calculate":
            guard let request = body["request"], let id = body["id"] as? Int,
                  let data = try? JSONSerialization.data(withJSONObject: request),
                  let input = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.global(qos: .userInitiated).async {
                let ptr = input.withCString { boxCalculate($0) }
                let text = String(cString: ptr); boxFree(ptr)
                let result = (try? JSONSerialization.jsonObject(with: Data(text.utf8))) ?? ["error": "Calculation failed."]
                DispatchQueue.main.async {
                    self.webView?.callAsyncJavaScript("window.deliverNativeResult(id, result)", arguments: ["id": id, "result": result], in: nil, in: .page)
                }
            }
        case "save":
            guard let text = body["text"] as? String, let name = body["name"] as? String else { return }
            let panel = NSSavePanel()
            panel.allowedContentTypes = name.hasSuffix(".csv") ? [.commaSeparatedText] : [.json]
            panel.nameFieldStringValue = name
            if panel.runModal() == .OK, let url = panel.url {
                do { try text.write(to: url, atomically: true, encoding: .utf8); notice("Saved \(url.lastPathComponent)") }
                catch { notice(error.localizedDescription) }
            }
        case "open": openProject()
        default: break
        }
    }
    func openProject() {
        let panel = NSOpenPanel(); panel.allowedContentTypes = [.json]; panel.canChooseDirectories = false
        if panel.runModal() == .OK, let url = panel.url {
            do {
                let data = try Data(contentsOf: url)
                guard data.count < 2_000_000 else { notice("This configuration file is too large."); return }
                let project = try JSONSerialization.jsonObject(with: data)
                webView?.callAsyncJavaScript("window.restoreProject(project)", arguments: ["project": project], in: nil, in: .page)
            } catch { notice("Could not read the configuration: \(error.localizedDescription)") }
        }
    }
    func notice(_ text: String) {
        webView?.callAsyncJavaScript("window.nativeNotice(text)", arguments: ["text": text], in: nil, in: .page)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        let site = Bundle.main.resourceURL!.appendingPathComponent("site").path + "/"
        if url.isFileURL && url.standardizedFileURL.path.hasPrefix(site) { decisionHandler(.allow); return }
        if navigationAction.navigationType == .linkActivated && ["https", "http"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        decisionHandler(.cancel)
    }
}

struct GuidedWorkspace: NSViewRepresentable {
    let bridge: StudioBridge
    func makeNSView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(bridge, name: "studio")
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = bridge; bridge.webView = view
        let site = Bundle.main.resourceURL!.appendingPathComponent("site")
        view.loadFileURL(site.appendingPathComponent("index.html"), allowingReadAccessTo: site)
        return view
    }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}

@main struct BoxStudioApp: App {
    @StateObject private var bridge = StudioBridge()
    var body: some Scene {
        WindowGroup("Box Studio") { GuidedWorkspace(bridge: bridge).frame(minWidth: 1000, minHeight: 720) }
        .defaultSize(width: 1360, height: 900)
        .commands { CommandGroup(replacing: .newItem) { Button("Open configuration…") { bridge.openProject() }.keyboardShortcut("o") } }
    }
}
