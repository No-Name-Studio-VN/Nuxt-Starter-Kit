import SwiftUI

/// "Module: auth" with a button that removes the filter.
struct ModuleFilterChip: View {
    let module: String
    let onClear: () -> Void

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "line.3.horizontal.decrease").imageScale(.small).foregroundStyle(Theme.amber)
            Text("Module")
                .foregroundStyle(.secondary)
            Text(module).fontWeight(.semibold)
            Button(action: onClear) {
                Image(systemName: "xmark.circle.fill")
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .help("Show every project")
            .accessibilityLabel("Remove module filter \(module)")
        }
        .font(.callout)
        .padding(.leading, 10)
        .padding(.trailing, 8)
        .padding(.vertical, 5)
        .background(Theme.amber.opacity(0.12), in: .rect(cornerRadius: Theme.radius))
        .overlay {
            RoundedRectangle(cornerRadius: Theme.radius).strokeBorder(Theme.amber.opacity(0.5), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
    }
}
