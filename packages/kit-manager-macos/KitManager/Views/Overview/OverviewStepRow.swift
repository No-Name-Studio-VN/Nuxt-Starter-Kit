import KitManagerCore
import SwiftUI

/// One suggested action, with a separate link to the project page.
struct OverviewStepRow: View {
    let step: NextStep.Kind
    let row: ProjectRow
    let latestLabel: String

    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(spacing: 12) {
            Button {
                model.openDetail(row.project)
            } label: {
                HStack(spacing: 12) {
                    ProjectIcon(name: row.name, size: 30)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(title)
                        if let detail {
                            Text(detail).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityHint("Opens the project page")
            Spacer(minLength: 0)
            action.fixedSize()
        }
        .padding(.vertical, 2)
    }

    private var title: String {
        switch step {
        case .fixConflicts(let count):
            "Fix \(count) \(count == 1 ? "conflict" : "conflicts") in \(row.name)"
        case .update:
            "Update \(row.name) to \(latestLabel)"
        case .migrate:
            "Move \(row.name) onto the kit"
        case .missingEnvKeys(let count):
            "Add \(count) missing environment \(count == 1 ? "key" : "keys") to \(row.name)"
        case .siteDown:
            "\(row.name)'s website isn't responding"
        }
    }

    private var detail: String? {
        switch step {
        case .fixConflicts:
            return "Left over from the last kit update"
        case .update:
            guard let report = row.snapshot?.preview.value else { return "Preparing preview…" }
            let summary = PreviewSummary(report: report)
            let merges = summary.counts[.merge, default: 0]
            let mergeText = merges == 1 ? "1 file to merge" : "\(merges) files to merge"
            let conflictText = switch summary.conflicts {
            case 0: "no conflicts"
            case 1: "1 conflict"
            default: "\(summary.conflicts) conflicts"
            }
            return "\(mergeText) · \(conflictText)"
        case .migrate(let others):
            guard let source = row.status.detail else { return nil }
            return others > 0 ? "\(source) · and \(others) more like it" : source
        case .missingEnvKeys, .siteDown:
            return nil
        }
    }

    @ViewBuilder
    private var action: some View {
        switch step {
        case .fixConflicts:
            Button("Fix with Claude") {
                Task { await model.openTerminal(row.project, command: .claude) }
            }
            .buttonStyle(.glassProminent)
        case .update:
            let canUpgrade = model.canUpgrade(row.project)
            Button("Review upgrade") { model.flow = .upgrade(row.project) }
                .buttonStyle(.glass)
                .disabled(!canUpgrade)
                .help(canUpgrade ? "Review the update" : model.upgradePrecondition(row.project).reason ?? "Build the nuxt-saas CLI first")
        case .migrate:
            Button("Start") { model.flow = .migration(row.project) }
                .buttonStyle(.glass)
        case .missingEnvKeys, .siteDown:
            Button("Open") { model.openDetail(row.project) }
                .buttonStyle(.glass)
        }
    }
}
