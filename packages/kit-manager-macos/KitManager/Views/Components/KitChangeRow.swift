import KitManagerCore
import SwiftUI

/// A kit commit with the message and age above a separate row of module chips.
struct KitChangeRow: View {
    let commit: KitCommit
    let onOpen: (() -> Void)?

    @Environment(\.colorSchemeContrast) private var contrast
    @State private var isHovered = false

    init(commit: KitCommit, onOpen: (() -> Void)? = nil) {
        self.commit = commit
        self.onOpen = onOpen
    }

    var body: some View {
        let modules = ChangelogGrouper.ordered(Array(commit.modules))
        if let onOpen {
            Button(action: onOpen) { content(modules: modules) }
                .buttonStyle(.plain)
                .background(isHovered ? Color.primary.opacity(0.06) : .clear, in: .rect(cornerRadius: 8))
                .onHover { isHovered = $0 }
                .pointerStyle(.link)
                .accessibilityLabel(accessibleLabel(modules: modules))
                .accessibilityHint("Shows the code changes for this commit.")
        } else {
            content(modules: modules)
                .accessibilityElement(children: .combine)
                .accessibilityLabel(accessibleLabel(modules: modules))
        }
    }

    private func content(modules: [String]) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            if commit.breaking {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.callout)
                    .foregroundStyle(.red)
                    .frame(width: 18)
            } else {
                CommitKindIcon(commit: commit)
            }
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(commit.breaking ? "Breaking: \(commit.title)" : commit.title)
                        .font(.callout.weight(commit.breaking ? .semibold : .regular))
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .help(commit.title)
                    Text(shortAge)
                        .font(.caption.monospacedDigit().weight(.medium))
                        .foregroundStyle(contrast == .increased ? .secondary : .tertiary)
                        .fixedSize()
                        .help(commit.date.formatted(date: .abbreviated, time: .shortened))
                }
                if !modules.isEmpty {
                    ModuleChips(modules: modules)
                }
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 5)
        .contentShape(.rect)
    }

    private static let ageFormatter: DateComponentsFormatter = {
        let formatter = DateComponentsFormatter()
        formatter.allowedUnits = [.year, .month, .weekOfMonth, .day, .hour, .minute, .second]
        formatter.unitsStyle = .abbreviated
        formatter.maximumUnitCount = 1
        return formatter
    }()

    private var shortAge: String {
        let now = Date.now
        guard commit.date <= now else { return relativeAge }
        return Self.ageFormatter.string(from: commit.date, to: now) ?? relativeAge
    }

    private var relativeAge: String { commit.date.formatted(.relative(presentation: .numeric)) }

    private func accessibleLabel(modules: [String]) -> String {
        let kind = commit.breaking ? "\(commit.kindWord), breaking change" : commit.kindWord
        let affected = modules.isEmpty ? [] : ["Modules: \(modules.joined(separator: ", "))"]
        return ([kind, commit.title] + affected + [relativeAge]).joined(separator: ". ")
    }
}
