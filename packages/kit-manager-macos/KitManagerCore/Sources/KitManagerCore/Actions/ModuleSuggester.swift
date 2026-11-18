public enum ModuleSuggester {
    /// Ids of the selectable (non-internal) modules that share at least one dependency with the project, sorted.
    public static func suggest(dependencies: Set<String>, catalogue: [KitModuleInfo]) -> [String] {
        catalogue
            .filter { !$0.internal && !dependencies.isDisjoint(with: $0.dependencies) }
            .map(\.id)
            .sorted()
    }
}
