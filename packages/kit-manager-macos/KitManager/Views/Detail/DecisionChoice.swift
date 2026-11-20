import KitManagerCore

/// One way to settle a file in the walk-through sheet.
enum DecisionChoice: Hashable, CaseIterable {
    case takeKit, combine, keepMine, decline

    init?(_ suggestion: SuggestionAction) {
        switch suggestion {
        case .takeKit: self = .takeKit
        case .combine: self = .combine
        case .keepMine: self = .keepMine
        case .byHand: return nil
        }
    }

    var action: ResolutionAction {
        switch self {
        case .takeKit: .takeKit
        case .combine: .combine
        case .keepMine, .decline: .keepMine
        }
    }

    var declinesFeature: Bool { self == .decline }

    /// Choices that make sense for this file; combining needs both sides of a conflict.
    static func available(for decision: Decision) -> [DecisionChoice] {
        allCases.filter { choice in
            switch choice {
            case .takeKit, .keepMine: true
            case .combine: decision.kind == .conflict
            case .decline: !decision.notes.isEmpty
            }
        }
    }

    func isEnabled(for decision: Decision) -> Bool {
        self != .takeKit || decision.kind == .conflict || decision.hasKitVersion
    }
}
