import KitManagerCore

/// A project module, which may not have a matching entry in the current catalogue.
struct ModuleChoice: Identifiable, Hashable {
    let id: String
    let info: KitModuleInfo?

    var title: String { info?.title ?? id }
    var detail: String { info?.description ?? "" }
}
