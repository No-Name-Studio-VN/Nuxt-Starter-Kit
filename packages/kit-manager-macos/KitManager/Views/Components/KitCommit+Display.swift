import KitManagerCore
import SwiftUI

extension KitCommit {
    private var kindDisplay: (word: String, symbol: String, color: Color) {
        switch type {
        case "feat": ("New", "sparkles", .accentColor)
        case "fix": ("Fix", "wrench.adjustable.fill", .orange)
        default: ("Change", "circle.fill", .secondary)
        }
    }

    var kindWord: String { kindDisplay.word }
    var kindSymbol: String { kindDisplay.symbol }
    var kindColor: Color { kindDisplay.color }
    /// The plain dot for other changes sits smaller so New and Fix stand out.
    var kindIsMinor: Bool { type != "feat" && type != "fix" }
}
