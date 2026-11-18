import SwiftUI

/// The Settings-style icon for each kit module.
enum ModuleAppearance {
    static func symbol(for id: String) -> String {
        icon(for: id).symbol
    }

    static func color(for id: String) -> Color {
        icon(for: id).color
    }

    private static func icon(for id: String) -> (symbol: String, color: Color) {
        switch id {
        case "base": ("square.stack.3d.up.fill", .gray)
        case "server-core": ("server.rack", .indigo)
        case "database": ("cylinder.split.1x2.fill", .teal)
        case "auth": ("person.badge.key.fill", .blue)
        case "auth-2fa": ("lock.shield.fill", .blue)
        case "auth-email-verification": ("envelope.badge.fill", .cyan)
        case "auth-passkeys": ("person.badge.key.fill", .purple)
        case "admin": ("slider.horizontal.3", .gray)
        case "admin-kv": ("tablecells.fill", .brown)
        case "admin-users": ("person.2.fill", .gray)
        case "content": ("doc.richtext.fill", .orange)
        case "feature-flags": ("flag.fill", .pink)
        case "pwa": ("apps.iphone", .green)
        default: ("puzzlepiece.extension.fill", .gray)
        }
    }
}
