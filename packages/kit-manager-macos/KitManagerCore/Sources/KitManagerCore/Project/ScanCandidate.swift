import Foundation

public struct ScanCandidate: Sendable, Hashable {
    public let url: URL
    public let kind: ProjectKind

    public init(url: URL, kind: ProjectKind) {
        self.url = url
        self.kind = kind
    }
}
