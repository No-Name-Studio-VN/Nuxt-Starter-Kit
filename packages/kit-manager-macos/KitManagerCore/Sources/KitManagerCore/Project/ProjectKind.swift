import Foundation

/// What a project folder is, in the order the app checks (spec 2.4).
public enum ProjectKind: Sendable, Equatable, Hashable {
    /// `.nuxt-saas.json` exists and is valid.
    case kitV3(KitState)
    /// A kit 2.x project: `.nuxt-saas/manifest.json` exists.
    case kitLegacy
    /// `package.json` lists `nuxt`.
    case nuxt
    case other
    /// The folder was moved or deleted after it was added.
    case missing
    /// `.nuxt-saas.json` exists but is unusable; the associated value is a readable reason.
    case invalidState(String)
}
