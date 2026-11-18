import KitManagerCore
import SwiftUI

/// How many kit-owned files the project has edited or deleted, per layer, with the edited files
/// themselves (click to open in VS Code).
struct CustomisationSection: View {
    let project: Project
    let snapshot: ProjectSnapshot

    @Environment(AppModel.self) private var model
    @State private var showExpected = false
    @State private var showAllFiles = false

    private static let collapsedCount = 8

    var body: some View {
        GlassCard("Customisation") {
            content
        } trailing: {
            Button {
                Task { await model.loadInspect(project) }
            } label: {
                Label(snapshot.inspect.value == nil ? "Inspect" : "Inspect again", systemImage: "arrow.clockwise")
            }
            .quietGlassButton()
            .disabled(snapshot.inspect == .loading || model.cliStatus != .ready)
            .help(model.cliStatus == .ready ? "Compare the project with the kit again" : "Build the nuxt-saas CLI first")
        }
    }

    @ViewBuilder
    private var content: some View {
        switch snapshot.inspect {
        case .idle:
            Text(
                model.cliStatus == .ready
                    ? "Not inspected yet. Inspect compares this project with the kit commit it was generated from."
                    : "The customisation score needs the built nuxt-saas CLI."
            )
            .font(.callout)
            .foregroundStyle(.secondary)
        case .loading:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Comparing with the kit…").font(.callout).foregroundStyle(.secondary)
            }
        case .failed(let message):
            FailureView(message: message)
        case .loaded(let report, let stale):
            loaded(report, stale: stale)
        }
    }

    private func loaded(_ report: InspectReport, stale: Bool) -> some View {
        let summary = report.summary
        let layers = Customisation.layers(of: report)
        let files = Customisation.changedFiles(of: report, includeExpected: showExpected)
        let shown = showAllFiles ? files : Array(files.prefix(Self.collapsedCount))
        return VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text(summary.score.formatted(.percent.precision(.fractionLength(0))))
                        .font(.system(size: 34, weight: .semibold).monospacedDigit())
                        .foregroundStyle(summary.scoredChanged > 0 ? Theme.amber : Color.primary)
                    Text("\(summary.scoredChanged) of \(summary.scored) kit files changed")
                        .font(.callout)
                        .foregroundStyle(.secondary)
                }
                ScoreMeter(value: summary.score)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(
                "Customisation \(summary.score.formatted(.percent.precision(.fractionLength(0)))): \(summary.scoredChanged) of \(summary.scored) kit files changed")

            if layers.count > 0 {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(layers) { layer in layerRow(layer) }
                }
            }

            fileList(files: files, shown: shown, hiddenExpected: expectedChangeCount(report))

            Text("A high score means upgrades will merge by hand. Files you keep rewriting are candidates to move back into the kit.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if stale {
                Label("Computed for an earlier state of the project. Inspect again to refresh.", systemImage: "clock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func layerRow(_ layer: LayerCustomisation) -> some View {
        HStack(spacing: 10) {
            Text(layer.layer)
                .font(.callout)
                .frame(width: 96, alignment: .leading)
                .lineLimit(1)
                .truncationMode(.tail)
            ScoreMeter(value: layer.score, height: 4)
            Text("\(layer.edited) edited · \(layer.deleted) deleted")
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
                .frame(width: 130, alignment: .trailing)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(layer.layer): \(layer.edited) edited, \(layer.deleted) deleted of \(layer.scored)")
    }

    @ViewBuilder
    private func fileList(files: [InspectFile], shown: [InspectFile], hiddenExpected: Int) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Edited files").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            if files.isEmpty {
                Text("None. Every kit file matches the kit.").font(.callout).foregroundStyle(.secondary)
            }
            ForEach(shown, id: \.path) { file in
                fileRow(file)
            }
            if files.count > Self.collapsedCount {
                Button(showAllFiles ? "Show fewer" : "Show all \(files.count) files") { showAllFiles.toggle() }
                    .buttonStyle(.plain)
                    .foregroundStyle(Theme.amber)
                    .font(.caption)
            }
            if hiddenExpected > 0 || showExpected {
                Toggle("Include files meant to be edited (\(hiddenExpected))", isOn: $showExpected)
                    .toggleStyle(.checkbox)
                    .font(.caption)
                    .padding(.top, 4)
            }
        }
    }

    private func fileRow(_ file: InspectFile) -> some View {
        let isDeleted = file.status == .deleted
        return Button {
            Task { await model.openInVSCode(project, relativePath: file.path) }
        } label: {
            HStack(spacing: 8) {
                Text(isDeleted ? "-" : "~")
                    .font(.callout.monospaced().weight(.bold))
                    .foregroundStyle(isDeleted ? Theme.red : Theme.amber)
                    .frame(width: 14)
                Text(file.path)
                    .font(.caption.monospaced())
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if file.layer != ModuleMapping.base {
                    Text(file.layer).font(.caption2).foregroundStyle(.secondary)
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(isDeleted)
        .help(isDeleted ? "\(file.path) was deleted" : "Open \(file.path) in VS Code")
        .accessibilityLabel("\(isDeleted ? "Deleted" : "Edited"): \(file.path)")
        .accessibilityHint(isDeleted ? "" : "Opens the file in VS Code")
    }

    /// Edited or deleted files that projects are meant to change, which the default list hides.
    private func expectedChangeCount(_ report: InspectReport) -> Int {
        Customisation.changedFiles(of: report, includeExpected: true).count
            - Customisation.changedFiles(of: report).count
    }
}
