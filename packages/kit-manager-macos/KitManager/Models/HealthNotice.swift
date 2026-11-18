/// The health issue to show when a project's kit status does not explain why it needs attention.
enum HealthNotice: Equatable {
    case siteDown(missingKeys: Int)
    case missingEnvKeys(Int)

    var title: String {
        switch self {
        case .siteDown: "Website not responding"
        case .missingEnvKeys(let count): "\(count) environment \(count == 1 ? "key" : "keys") missing"
        }
    }

    var detail: String? {
        guard case .siteDown(let count) = self, count > 0 else { return nil }
        return "\(count) env keys missing"
    }
}
