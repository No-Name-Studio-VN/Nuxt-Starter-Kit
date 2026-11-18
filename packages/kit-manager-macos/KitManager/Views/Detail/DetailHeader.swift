import KitManagerCore
import SwiftUI

/// The project's icon, name, path, status and open controls.
struct DetailHeader: View {
    let row: ProjectRow
    let onLocate: () -> Void

    var body: some View {
        Section {
            Group {
                if row.isMissing {
                    info
                } else {
                    ViewThatFits(in: .horizontal) {
                        HStack(spacing: 0) {
                            info
                            Spacer(minLength: 12)
                            actions(controlSize: .small)
                                .fixedSize(horizontal: true, vertical: false)
                        }
                        VStack(alignment: .leading, spacing: 14) {
                            info
                            actions(controlSize: .regular)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 6)
        }
    }

    private var info: some View {
        HStack(spacing: 14) {
            ProjectIcon(name: row.name, size: 60)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(row.name)
                    .font(.title2.bold())
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .accessibilityAddTraits(.isHeader)
                Text(row.displayPath)
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .textSelection(.enabled)
                    .help(row.project.path)
                HStack(spacing: 8) {
                    StatusPill(status: row.snapshot?.isKitSource == true ? .kitSource : row.status)
                    if row.isKitProject {
                        Text("Kit \(row.kitLabel)")
                            .font(row.kitIsCommit ? .callout.monospaced() : .callout)
                            .foregroundStyle(.secondary)
                            .help("Kit version")
                            .accessibilityLabel("Kit version \(row.kitLabel)")
                    }
                }
                .padding(.top, 2)
            }
        }
    }

    private func actions(controlSize: ControlSize) -> some View {
        OpenButtons(project: row.project, row: row, onLocate: onLocate, compact: false, preferredControlSize: controlSize)
    }
}
