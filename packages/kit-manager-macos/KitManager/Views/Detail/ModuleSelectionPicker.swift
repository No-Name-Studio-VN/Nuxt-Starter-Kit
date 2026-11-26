import KitManagerCore
import SwiftUI

/// A grouped checkbox picker for choosing kit modules.
struct ModuleSelectionPicker: View {
    let choices: [ModuleChoice]
    @Binding var selection: Set<String>
    var projection: CreateModuleSelection? = nil
    var searchText = ""
    var ungroupedTitle: String? = nil

    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        let groups = groupModules(choices, matching: searchText, module: \.info)
        if groups.isEmpty, !searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Label("No matching modules", systemImage: "magnifyingglass")
                .foregroundStyle(.secondary)
        }
        ForEach(groups) { group in
            if let name = group.name ?? ungroupedTitle {
                Text(name)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityAddTraits(.isHeader)
            }
            ForEach(group.entries) { entry in
                moduleToggle(entry.item)
                    .padding(.leading, CGFloat(entry.depth) * 16)
            }
        }
    }

    private func moduleToggle(_ choice: ModuleChoice) -> some View {
        let isDefault = projection?.defaults.contains(choice.id) == true
        let requiring = projection?.requiredBy[choice.id] ?? []
        let locked = isDefault || !requiring.isEmpty
        let reason = selectionReason(choice, isDefault: isDefault, requiring: requiring)
        let isSelected = Binding(
            get: { projection?.effective.contains(choice.id) ?? selection.contains(choice.id) },
            set: { isOn in
                guard isEnabled, !locked else { return }
                if isOn { selection.insert(choice.id) } else { selection.remove(choice.id) }
            })
        return HStack(spacing: 6) {
            // A checkbox with a multiline label aligns to the first line in a grouped Form.
            Toggle(choice.title, isOn: isSelected)
                .labelsHidden()
                .toggleStyle(.checkbox)
                .accessibilityLabel(reason.isEmpty ? choice.title : "\(choice.title), \(reason)")
                .accessibilityHint(choice.detail)
                .disabled(locked)
            HStack(spacing: 10) {
                SettingsIcon(symbol: ModuleAppearance.symbol(for: choice.id), color: ModuleAppearance.color(for: choice.id))
                VStack(alignment: .leading, spacing: 2) {
                    Text(choice.title).fontWeight(.medium)
                    if !choice.detail.isEmpty {
                        Text(choice.detail).font(.caption).foregroundStyle(.secondary)
                    }
                    if !reason.isEmpty {
                        Text(reason).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .contentShape(.rect)
            .onTapGesture { isSelected.wrappedValue.toggle() }
            .accessibilityHidden(true)
        }
    }

    private func selectionReason(_ choice: ModuleChoice, isDefault: Bool, requiring: [String]) -> String {
        guard projection != nil else { return "" }
        var reasons: [String] = []
        if selection.contains(choice.id) { reasons.append("Selected by you") }
        if isDefault { reasons.append("Included by default") }
        if !requiring.isEmpty {
            let titles = requiring.map { id in choices.first { $0.id == id }?.title ?? id }
            reasons.append("Required by \(titles.joined(separator: ", "))")
        }
        if choice.info?.internal == true, requiring.isEmpty || selection.contains(choice.id) {
            reasons.append("Legacy internal module; a later Remove may prune it if unneeded")
        }
        return reasons.joined(separator: " · ")
    }
}
