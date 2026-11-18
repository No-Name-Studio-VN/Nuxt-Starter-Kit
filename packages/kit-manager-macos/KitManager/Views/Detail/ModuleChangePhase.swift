import KitManagerCore

/// Where the add/remove sheet is: planning with `--check` comes first, applying second.
enum ModuleChangePhase {
    case idle
    case previewing
    case planned(TransitionReport)
    case failed(PresentedError)
    case applying
    case applied(TransitionReport)
}
