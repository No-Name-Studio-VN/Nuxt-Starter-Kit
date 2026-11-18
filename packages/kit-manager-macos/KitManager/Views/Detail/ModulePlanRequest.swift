import KitManagerCore

/// The inputs that identify an individual module preview task.
struct ModulePlanRequest: Hashable {
    let action: ModuleAction
    let selection: Set<String>
    let attempt: Int
}
