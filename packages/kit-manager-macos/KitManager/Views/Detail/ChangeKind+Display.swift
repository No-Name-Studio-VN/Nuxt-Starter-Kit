import KitManagerCore
import SwiftUI

extension ChangeKind {
    /// `+ ~ M ! - =`: one character per kind, as the CLI's own report uses.
    var symbol: String {
        switch self {
        case .create: "+"
        case .update: "~"
        case .merge: "M"
        case .conflict: "!"
        case .delete: "-"
        case .keepEdited, .keepProtected: "="
        }
    }

    var title: String {
        switch self {
        case .create: "new"
        case .update: "updated"
        case .merge: "merged"
        case .conflict: "conflict"
        case .delete: "deleted"
        case .keepEdited: "kept, edited"
        case .keepProtected: "kept, protected"
        }
    }

    var color: Color {
        switch self {
        case .create: Color.green
        case .merge: Color.accentColor
        case .conflict: Color.red
        case .update, .delete, .keepEdited, .keepProtected: Color.secondary
        }
    }

    /// Most important first: conflicts, then merges.
    var sortRank: Int {
        switch self {
        case .conflict: 0
        case .merge: 1
        case .update: 2
        case .create: 3
        case .delete: 4
        case .keepEdited: 5
        case .keepProtected: 6
        }
    }
}
