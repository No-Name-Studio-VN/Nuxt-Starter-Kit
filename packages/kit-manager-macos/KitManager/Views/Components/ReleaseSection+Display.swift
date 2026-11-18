import KitManagerCore
import SwiftUI

extension ReleaseSection {
    var title: String { tag ?? "Unreleased" }

    var displayDate: String? {
        commits.lazy.map(\.date).max()?.formatted(date: .abbreviated, time: .omitted)
    }

    var iconSymbol: String { tag == nil ? "sparkles" : "shippingbox.fill" }
    var iconColor: Color { tag == nil ? .accentColor : .brown }
}
