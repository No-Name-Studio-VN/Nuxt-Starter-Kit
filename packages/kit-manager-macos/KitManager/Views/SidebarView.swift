import SwiftUI

struct SidebarView: View {
    @Binding var selection: SidebarItem?

    @Environment(AppModel.self) private var model

    var body: some View {
        List(SidebarItem.allCases, id: \.self, selection: $selection) { item in
            Label(item.title, systemImage: item.symbol)
                .badge(item == .needsAttention ? model.attentionCount : 0)
                .accessibilityLabel(label(for: item))
        }
        .navigationSplitViewColumnWidth(min: 190, ideal: 210, max: 280)
    }

    private func label(for item: SidebarItem) -> String {
        guard item == .needsAttention, model.attentionCount > 0 else { return item.title }
        return "\(item.title), \(model.attentionCount) projects"
    }
}
