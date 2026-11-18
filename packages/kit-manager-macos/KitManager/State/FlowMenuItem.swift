/// The Upgrade or Migrate entry a project's menu offers.
enum FlowMenuItem {
    case none
    case upgrade(isEnabled: Bool)
    case migrate
}
