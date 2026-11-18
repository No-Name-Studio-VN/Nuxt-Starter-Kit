import Foundation

/// Outcome of the last `git fetch` in the kit checkout. A failure is "offline", not an error.
enum FetchState: Equatable {
    case idle
    case fetching
    case fetched(Date)
    case offline
}
