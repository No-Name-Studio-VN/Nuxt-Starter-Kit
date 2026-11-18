/// The status filters for the project list.
public enum StatusFilter: String, CaseIterable, Sendable, Hashable {
    case upToDate, updates, notOnKit

    public func matches(_ status: ProjectStatus) -> Bool {
        switch (self, status) {
        case (.upToDate, .upToDate), (.updates, .behind):
            return true
        case (.notOnKit, .needsMigration(let source)):
            return source != .other
        default:
            return false
        }
    }
}
