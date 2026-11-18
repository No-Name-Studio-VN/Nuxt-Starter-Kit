/// The sort order saved for the center project list.
enum ProjectSort: String, CaseIterable {
    case status, name, dateAdded

    var title: String {
        switch self {
        case .status: "Status"
        case .name: "Name"
        case .dateAdded: "Date Added"
        }
    }
}
