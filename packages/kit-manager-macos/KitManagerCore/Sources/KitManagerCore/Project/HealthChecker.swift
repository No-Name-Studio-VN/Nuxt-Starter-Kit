import Foundation

public protocol HealthChecking: Sendable {
    func check(_ url: URL) async -> SiteHealth
}

/// Sends a HEAD request with a 5 s timeout and reports status code and latency.
public struct HealthChecker: HealthChecking {
    public static let timeout: TimeInterval = 5

    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func check(_ url: URL) async -> SiteHealth {
        var request = URLRequest(url: url, timeoutInterval: Self.timeout)
        request.httpMethod = "HEAD"

        let clock = ContinuousClock()
        let start = clock.now
        do {
            let (_, response) = try await session.data(for: request)
            let latency = start.duration(to: clock.now)
            guard let http = response as? HTTPURLResponse else {
                return SiteHealth(statusCode: nil, latency: latency, error: "Not an HTTP response")
            }
            return SiteHealth(statusCode: http.statusCode, latency: latency, error: nil)
        } catch {
            return SiteHealth(statusCode: nil, latency: nil, error: error.localizedDescription)
        }
    }
}
