import SwiftUI

/// The project icon, name, kit version and status in the center list.
struct ProjectListRow: View {
    let row: ProjectRow

    var body: some View {
        HStack(spacing: 10) {
            ProjectIcon(name: row.name, size: 34)
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline) {
                    Text(row.name)
                        .fontWeight(.semibold)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    if row.isKitProject {
                        Text(row.kitLabel)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                            .lineLimit(1)
                    }
                }
                statusLine
                    .font(.subheadline)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 3)
        .help(row.project.path)
        .tag(row.id)
    }

    @ViewBuilder
    private var statusLine: some View {
        if let notice = row.healthNotice {
            let isSiteDown = if case .siteDown = notice { true } else { false }
            let detail = notice.detail.map { " · \($0)" } ?? ""
            let secondaryText = Text(detail).foregroundStyle(.secondary)
            Label {
                Text("\(notice.title)\(secondaryText)")
            } icon: {
                Image(systemName: isSiteDown ? "exclamationmark.icloud.fill" : "key.fill")
                    .foregroundStyle(isSiteDown ? Color.red : Color.orange)
            }
            .help("\(row.status.help) · \(notice.title)\(detail)")
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(row.status.title), \(notice.title)\(detail)")
        } else {
            StatusLabel(status: row.status)
        }
    }
}
