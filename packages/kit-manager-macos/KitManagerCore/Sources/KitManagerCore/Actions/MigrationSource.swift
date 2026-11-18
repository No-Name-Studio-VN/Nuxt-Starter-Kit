/// What a project being migrated to the kit is today.
public enum MigrationSource: Sendable, Equatable {
    /// Created by create-nuxt-saas 2.x, which the CLI cannot manage.
    case legacy
    /// A plain Nuxt project.
    case nuxt
    case other
}
