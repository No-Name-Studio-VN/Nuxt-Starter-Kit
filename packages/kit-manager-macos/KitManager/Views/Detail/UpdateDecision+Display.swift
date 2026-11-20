import KitManagerCore
import SwiftUI

extension DecisionKind {
    var displayTitle: String { self == .conflict ? "conflict" : "keeps your version" }
    var symbol: String { self == .conflict ? "exclamationmark.triangle.fill" : "arrow.uturn.backward" }
    var tone: StatusTone { self == .conflict ? .warning : .neutral }
}

extension ChangeNoteKind {
    var displayTitle: String { rawValue.capitalized }

    var symbol: String {
        switch self {
        case .feature: "sparkle"
        case .fix: "wrench"
        case .security: "shield.fill"
        }
    }

    var tone: StatusTone {
        switch self {
        case .feature: .accent
        case .fix: .neutral
        case .security: .critical
        }
    }
}

extension SuggestionAction {
    var tone: StatusTone {
        switch self {
        case .takeKit: .accent
        case .combine: .positive
        case .keepMine, .byHand: .neutral
        }
    }

    var symbol: String {
        switch self {
        case .takeKit: "arrow.down.circle"
        case .combine: "arrow.triangle.merge"
        case .keepMine: "arrow.uturn.backward"
        case .byHand: "hand.raised"
        }
    }
}

extension DecisionChoice {
    var title: String {
        switch self {
        case .takeKit: "Take the Kit's Version"
        case .combine: "Combine Both"
        case .keepMine: "Keep Mine"
        case .decline: "Keep Mine and Skip This Feature"
        }
    }

    var detail: String {
        switch self {
        case .takeKit: "Replace your file with the kit's. You'll need to redo your own edits."
        case .combine: "Keep your edits and add the kit's new lines."
        case .keepMine: "Leave your file as it is. The kit's changes aren't applied."
        case .decline: "Leave your file as it is and stop suggesting these kit changes."
        }
    }

    var symbol: String {
        switch self {
        case .takeKit: "arrow.down"
        case .combine: "arrow.triangle.merge"
        case .keepMine: "arrow.uturn.backward"
        case .decline: "bell.slash.fill"
        }
    }

    var color: Color {
        switch self {
        case .takeKit: .accentColor
        case .combine: .green
        case .keepMine: .gray
        case .decline: .orange
        }
    }
}
