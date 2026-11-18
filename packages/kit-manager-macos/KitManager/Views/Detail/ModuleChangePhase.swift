import KitManagerCore

/// Where the add/remove sheet is: planning with `--check` comes first, applying second.
enum ModuleChangePhase {
    case idle
    case previewing
    /// `ids` are the modules the plan was made for; Apply uses exactly these.
    case planned(TransitionReport, ids: [String])
    case failed(PresentedError)
    case applying
    case applied(TransitionReport, ids: [String])
}
