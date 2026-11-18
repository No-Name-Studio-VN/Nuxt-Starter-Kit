import SwiftUI

/// A project linked from a kit module or release.
struct KitProjectLink: View {
    let row: ProjectRow
    var moduleID: String?
    var isBehindOnModule = false

    @Environment(AppModel.self) private var model

    var body: some View {
        Button {
            if let filter = model.moduleFilter, !row.modules.contains(filter) {
                model.moduleFilter = nil
            }
            model.openDetail(row.project)
        } label: {
            HStack(spacing: 10) {
                ProjectIcon(name: row.name, size: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.name).fontWeight(.medium)
                    StatusLabel(status: row.status).font(.caption)
                    if isBehindOnModule {
                        Text("Behind on this module")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
            }
            .padding(.vertical, 2)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .help(help)
        .accessibilityHint("Opens the project page")
    }

    private var help: String {
        guard let moduleID else { return row.project.path }
        let behind = isBehindOnModule ? ", behind on a change to it" : ""
        return "\(row.name) uses \(moduleID)\(behind)."
    }
}
