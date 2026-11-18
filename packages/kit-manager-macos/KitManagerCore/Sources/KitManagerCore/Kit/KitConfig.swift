import Foundation

/// `packages/create-nuxt-saas/kit.json`: globs that never ship, and files projects are meant to edit.
public struct KitConfig: Codable, Sendable, Equatable {
    public let exclude: [String]
    public let userOwned: [String]?

    public init(exclude: [String], userOwned: [String]? = nil) {
        self.exclude = exclude
        self.userOwned = userOwned
    }
}
