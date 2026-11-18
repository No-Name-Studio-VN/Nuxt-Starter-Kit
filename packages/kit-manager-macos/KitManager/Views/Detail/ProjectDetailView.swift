import KitManagerCore
import SwiftUI
import UniformTypeIdentifiers

/// The scrolling detail page: a header and a grid of glass cards (spec 2.7). Cards that do not
/// apply to the project's kind are left out, not shown empty.
struct ProjectDetailView: View {
    let project: Project

    @Environment(AppModel.self) private var model

    @State private var width: CGFloat = 1000
    @State private var isLocating = false

    private static let twoColumnWidth: CGFloat = 860

    private enum Card: Hashable {
        case upgrade, whatsNew, modules, customisation, health, migration
    }

    var body: some View {
        let snapshot = model.snapshots[project.id]
        let row = ProjectRow(project: project, snapshot: snapshot)
        ScrollView {
            VStack(spacing: 16) {
                DetailHeader(project: project, snapshot: snapshot, onLocate: { isLocating = true })
                if let snapshot {
                    content(for: snapshot)
                } else {
                    ProgressView("Reading project…")
                        .frame(maxWidth: .infinity, minHeight: 160)
                }
            }
            .padding(20)
        }
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
        .navigationTitle(row.name)
        .toolbar {
            ToolbarItem {
                Button("Refresh", systemImage: "arrow.clockwise") {
                    Task { await model.refresh(project, force: true) }
                }
                .help("Refresh this project")
                .disabled(snapshot == nil || row.isMissing)
            }
        }
        .fileImporter(isPresented: $isLocating, allowedContentTypes: [.folder]) { result in
            if case .success(let url) = result { model.relocate(project, to: url) }
        }
    }

    // MARK: Layout

    @ViewBuilder
    private func content(for snapshot: ProjectSnapshot) -> some View {
        if case .missing = snapshot.kind {
            missingCard
        } else {
            if case .invalidState(let reason) = snapshot.kind {
                GlassCard("Invalid kit state") { FailureView(message: reason) }
            }
            let paired = pairedCards(for: snapshot)
            let full = fullWidthCards(for: snapshot)
            if paired.isEmpty {
                EmptyView()
            } else if width >= Self.twoColumnWidth {
                Grid(horizontalSpacing: 16, verticalSpacing: 16) {
                    ForEach(Array(stride(from: 0, to: paired.count, by: 2)), id: \.self) { index in
                        GridRow {
                            if index + 1 < paired.count {
                                card(paired[index], snapshot: snapshot)
                                card(paired[index + 1], snapshot: snapshot)
                            } else {
                                // An odd card out takes the whole row.
                                card(paired[index], snapshot: snapshot).gridCellColumns(2)
                            }
                        }
                    }
                }
            } else {
                VStack(spacing: 16) {
                    ForEach(paired, id: \.self) { card($0, snapshot: snapshot) }
                }
            }
            ForEach(full, id: \.self) { card($0, snapshot: snapshot) }
        }
    }

    /// Cards that sit two to a row on a wide window.
    private func pairedCards(for snapshot: ProjectSnapshot) -> [Card] {
        guard snapshot.kitState != nil, !snapshot.isKitSource else { return [] }
        var cards: [Card] = [.upgrade]
        if snapshot.usesDefaultTemplate, (snapshot.behind ?? 0) > 0 { cards.append(.whatsNew) }
        cards += [.modules, .customisation]
        return cards
    }

    private func fullWidthCards(for snapshot: ProjectSnapshot) -> [Card] {
        var cards: [Card] = [.health]
        if !snapshot.isKitSource, case .kitLegacy = snapshot.kind { cards.append(.migration) }
        if !snapshot.isKitSource, case .nuxt = snapshot.kind { cards.append(.migration) }
        if !snapshot.isKitSource, case .other = snapshot.kind { cards.append(.migration) }
        return cards
    }

    @ViewBuilder
    private func card(_ card: Card, snapshot: ProjectSnapshot) -> some View {
        switch card {
        case .upgrade: UpgradeSection(project: project, snapshot: snapshot)
        case .whatsNew: ChangelogSection(snapshot: snapshot)
        case .modules: ModulesSection(project: project, snapshot: snapshot)
        case .customisation: CustomisationSection(project: project, snapshot: snapshot)
        case .health: HealthSection(project: project, snapshot: snapshot)
        case .migration: MigrationSection(project: project, snapshot: snapshot)
        }
    }

    private var missingCard: some View {
        GlassCard("Folder missing") {
            VStack(alignment: .leading, spacing: 12) {
                Text("This folder was moved or deleted. Locate it again, or remove it from the list. Nothing else is touched.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    Button("Locate…", systemImage: "folder.badge.questionmark") { isLocating = true }
                        .buttonStyle(.glassProminent)
                    Button("Remove from List", systemImage: "minus.circle", role: .destructive) {
                        model.remove(project)
                    }
                    .buttonStyle(.glass)
                }
            }
        }
    }
}
