import AppKit
import SwiftUI

/// Warm charcoal with one amber accent, tight radii and hairlines (see the author's design notes).
enum Theme {
    static let amber = Color(red: 0.96, green: 0.65, blue: 0.14)
    static let red = Color(red: 0.91, green: 0.33, blue: 0.30)
    static let green = Color(red: 0.31, green: 0.76, blue: 0.47)
    static let grey = Color(nsColor: .secondaryLabelColor)

    static let radius: CGFloat = 6

    /// The content background: warm charcoal in dark mode, the window colour in light mode.
    static let canvas = Color(
        nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
                ? NSColor(red: 0.09, green: 0.086, blue: 0.082, alpha: 1)
                : NSColor.windowBackgroundColor
        })

    /// A solid card surface, used where glass is switched off (Reduce Transparency).
    static let surface = Color(
        nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
                ? NSColor(red: 0.125, green: 0.12, blue: 0.113, alpha: 1)
                : NSColor.controlBackgroundColor
        })

    /// A crisp 1 pt line that stays visible in both appearances.
    static let hairline = Color(
        nsColor: NSColor(name: nil) { appearance in
            appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
                ? NSColor(red: 0.21, green: 0.205, blue: 0.2, alpha: 1)
                : NSColor(white: 0, alpha: 0.12)
        })
}
