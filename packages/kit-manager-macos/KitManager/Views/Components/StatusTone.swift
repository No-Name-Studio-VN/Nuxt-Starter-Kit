import SwiftUI

/// The system colour for a status or notification.
enum StatusTone {
    case positive, accent, critical, warning, neutral

    var color: Color {
        switch self {
        case .positive: .green
        case .accent: .accentColor
        case .critical: .red
        case .warning: .orange
        case .neutral: .secondary
        }
    }
}
