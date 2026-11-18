import KitManagerCore

extension CLIStatus {
    var setupMessage: String {
        switch self {
        case .ready: "Ready"
        case .missingBuild: "Kit tools aren't built yet"
        case .staleBuild: "Kit tools need to be rebuilt"
        case .tooOld: "Kit is too old — update your kit checkout"
        case .missingCheckout: "Kit checkout not found"
        }
    }
}
