import KitManagerCore
import SwiftUI
import UniformTypeIdentifiers

/// The project's settings and status, grouped by purpose.
struct ProjectDetailView: View {
    let project: Project

    @Environment(AppModel.self) private var model
    @State private var isLocating = false
    @State private var updateReportSheet: UpdateReportSheet?

    var body: some View {
        let snapshot = model.snapshots[project.id]
        let row = ProjectRow(project: project, snapshot: snapshot)
        Form {
            if let snapshot {
                sections(for: snapshot, row: row)
            } else {
                header(row)
                Section {
                    ProgressView("Reading project…")
                        .frame(maxWidth: .infinity, minHeight: 160)
                }
            }
        }
        .formStyle(.grouped)
        .disclosureGroupStyle(.row)
        .defaultScrollAnchor(.top)
        .navigationTitle(row.name)
        .sheet(item: $updateReportSheet, onDismiss: refreshAfterUpdateReview) { sheet in
            switch sheet {
            case .walkthrough(let path):
                UpdateDecisionsSheet(project: project, startingAt: path)
            case .declined(let ids, let titles):
                DeclinedFeaturesSheet(project: project, ids: ids, titles: titles)
            }
        }
        .fileImporter(isPresented: $isLocating, allowedContentTypes: [.folder]) { result in
            if case .success(let url) = result { model.relocate(project, to: url) }
        }
    }

    @ViewBuilder
    private func sections(for snapshot: ProjectSnapshot, row: ProjectRow) -> some View {
        switch snapshot.kind {
        case .missing:
            header(row)
            missingSection
        case .invalidState(let reason):
            invalidSection(reason, row: row)
            HealthSection(project: project, snapshot: snapshot)
        case _ where snapshot.isKitSource:
            header(row)
            HealthSection(project: project, snapshot: snapshot)
        case .kitV3:
            header(row)
            if (snapshot.behind ?? 0) > 0 {
                UpgradeSection(project: project, snapshot: snapshot)
            }
            if let report = snapshot.lastReport {
                LastUpdateSection(project: project, snapshot: snapshot, report: report) { updateReportSheet = $0 }
            }
            if (snapshot.behind ?? 0) == 0 {
                UpgradeSection(project: project, snapshot: snapshot)
            }
            ModulesSection(project: project, snapshot: snapshot)
            CustomisationSection(project: project, snapshot: snapshot)
            HealthSection(project: project, snapshot: snapshot)
        case .kitLegacy, .nuxt, .other:
            header(row)
            MigrationSection(project: project, snapshot: snapshot)
            HealthSection(project: project, snapshot: snapshot)
        }
    }

    private func refreshAfterUpdateReview() {
        Task { await model.refresh(project, force: true) }
    }

    private func header(_ row: ProjectRow) -> some View {
        DetailHeader(row: row, onLocate: { isLocating = true })
    }

    private var missingSection: some View {
        Section("Folder missing") {
            Label {
                Text("This folder was moved or deleted. Locate it again, or remove it from the list. Nothing else is touched.")
                    .foregroundStyle(.secondary)
            } icon: {
                Image(systemName: "folder.badge.questionmark").foregroundStyle(.red)
            }
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

    private func invalidSection(_ reason: String, row: ProjectRow) -> some View {
        Section("Kit settings unreadable") {
            FailureView(message: reason)
            OpenButtons(project: project, row: row, onLocate: { isLocating = true })
        }
    }
}
