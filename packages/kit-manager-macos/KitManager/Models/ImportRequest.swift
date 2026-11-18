/// What Kit Manager should do with the folders chosen in the picker.
enum ImportRequest: Equatable {
    case add, scan, locate(Project)
}
