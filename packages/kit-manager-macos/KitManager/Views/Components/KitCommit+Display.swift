import KitManagerCore
import SwiftUI

extension KitCommit {
    private var kindDisplay: (word: String, color: Color) {
        switch type {
        case "feat": ("New", .accentColor)
        case "fix": ("Fix", .orange)
        default: ("Change", .secondary)
        }
    }

    var kindWord: String { kindDisplay.word }
    var kindColor: Color { kindDisplay.color }
}
