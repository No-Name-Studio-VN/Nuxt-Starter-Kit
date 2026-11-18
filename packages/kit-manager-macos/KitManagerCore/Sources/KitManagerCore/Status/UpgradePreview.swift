/// What the "behind" badge can say about the cost of upgrading.
public enum UpgradePreview: Sendable, Equatable {
    /// No preview yet: running, or waiting for the CLI.
    case pending
    /// `stale` means it was computed for an older working tree or kit commit.
    case ready(PreviewSummary, stale: Bool)
    case failed(String)

    init(_ preview: Loadable<TransitionReport>) {
        switch preview {
        case .idle, .loading: self = .pending
        case .loaded(let report, let stale): self = .ready(PreviewSummary(report: report), stale: stale)
        case .failed(let message): self = .failed(message)
        }
    }
}
