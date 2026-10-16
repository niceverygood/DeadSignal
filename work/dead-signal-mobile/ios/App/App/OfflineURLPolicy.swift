import Foundation

/// Only the packaged Capacitor origin may navigate in the privileged game WebView.
enum OfflineURLPolicy {
    static func allows(_ url: URL?) -> Bool {
        guard let url = url,
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme?.lowercased() == "capacitor",
              parts.host?.lowercased() == "localhost",
              parts.user == nil, parts.password == nil, parts.port == nil,
              !url.path.hasPrefix("/_capacitor_http_interceptor_") else { return false }
        return true
    }
}
