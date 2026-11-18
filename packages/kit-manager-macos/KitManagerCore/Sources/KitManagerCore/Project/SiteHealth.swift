import Foundation

public struct SiteHealth: Sendable, Equatable {
    public let statusCode: Int?
    public let latency: Duration?
    public let error: String?

    public init(statusCode: Int?, latency: Duration?, error: String?) {
        self.statusCode = statusCode
        self.latency = latency
        self.error = error
    }

    public var isUp: Bool { (200..<400).contains(statusCode ?? 0) }
}
