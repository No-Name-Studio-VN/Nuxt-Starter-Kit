import KitManagerCore
import SwiftUI

/// A report's file changes, with the most important kinds first.
struct ChangeFileList: View {
    let report: TransitionReport
    var modules: Set<String>? = nil
    var limit = 8

    @Environment(\.openKitDiff) private var openKitDiff
    @State private var isExpanded = false
    @State private var showAll = false

    private var sorted: [FileChangeSummary] {
        report.changes.sorted { lhs, rhs in
            lhs.kind.sortRank != rhs.kind.sortRank ? lhs.kind.sortRank < rhs.kind.sortRank : lhs.path < rhs.path
        }
    }

    var body: some View {
        if report.changes.isEmpty {
            ChangeSummaryChips(changes: report.changes)
        } else {
            DisclosureGroup(isExpanded: $isExpanded) {
                fileRows
            } label: {
                VStack(alignment: .leading, spacing: 5) {
                    Text(report.changes.count == 1 ? "1 changed file" : "\(report.changes.count) changed files")
                        .font(.callout.weight(.semibold))
                        .monospacedDigit()
                    ChangeSummaryChips(changes: report.changes)
                }
                .accessibilityElement(children: .combine)
                .padding(.vertical, 4)
            }
            .disclosureGroupStyle(.row)
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(.fill.quaternary, in: .rect(cornerRadius: 12, style: .continuous))
        }
    }

    private var fileRows: some View {
        let files = sorted
        return VStack(spacing: 1) {
            Divider().padding(.bottom, 4)
            ForEach(showAll ? files : Array(files.prefix(limit)), id: \.self) { change in
                if let openKitDiff {
                    Button { open(change, with: openKitDiff) } label: {
                        fileLabel(change, isButton: true)
                    }
                    .buttonStyle(RowButtonStyle())
                    .onKeyPress(.return) {
                        open(change, with: openKitDiff)
                        return .handled
                    }
                    .accessibilityLabel("\(change.kind.title): \(change.path)")
                    .accessibilityHint("Shows code changes for this file")
                } else {
                    fileLabel(change, isButton: false)
                        .accessibilityElement(children: .ignore)
                        .accessibilityLabel("\(change.kind.title): \(change.path)")
                }
            }
            if files.count > limit {
                Button(showAll ? "Show fewer" : "Show all \(files.count) files") { showAll.toggle() }
                    .buttonStyle(.glass)
                    .controlSize(.small)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 8)
            }
        }
    }

    private func open(_ change: FileChangeSummary, with action: OpenKitDiffAction) {
        action(DiffRequest(
            title: NSString(string: change.path).lastPathComponent, base: report.from, head: report.to,
            modules: modules, focusPath: change.path))
    }

    private func fileLabel(_ change: FileChangeSummary, isButton: Bool) -> some View {
        let path = NSString(string: change.path)
        return HStack(spacing: 10) {
            Text(change.kind.symbol)
                .font(.callout.monospaced().weight(.bold))
                .foregroundStyle(change.kind.color)
                .frame(width: 24, height: 24)
                .background(.fill.quaternary, in: .rect(cornerRadius: 6))
            VStack(alignment: .leading, spacing: 2) {
                Text(path.lastPathComponent)
                    .font(.callout.weight(.medium))
                if !path.deletingLastPathComponent.isEmpty {
                    Text(path.deletingLastPathComponent)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .lineLimit(1)
            .truncationMode(.middle)
            Spacer(minLength: 0)
            if isButton {
                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .frame(minHeight: 38)
        .help(change.path)
    }
}
