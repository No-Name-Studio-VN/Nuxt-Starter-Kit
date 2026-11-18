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
        Section {
            content
            HStack {
                Spacer()
                Button("Inspect Again", systemImage: "arrow.clockwise") {
                    Task { await model.loadInspect(project) }
                }
                .buttonStyle(.glass)
                .disabled(snapshot.inspect == .loading || model.cliStatus != .ready)
                .help(model.cliStatus == .ready ? "Compare the project with the kit again" : "Build the nuxt-saas CLI first")
            }
        } header: {
            Text("How Much You've Changed")
        } footer: {
            Text("Files you edited are merged during updates. Fewer edits means smoother updates.")
        }
    }

    @ViewBuilder
    private var content: some View {
        switch snapshot.inspect {
        case .idle:
            Text(
                model.cliStatus == .ready
                    ? "Not inspected yet. Inspect compares this project with the kit version it started from."
                    : "Build the nuxt-saas CLI to see which kit files you edited."
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

    @ViewBuilder
    private func loaded(_ report: InspectReport, stale: Bool) -> some View {
        let summary = report.summary
        let layers = Customisation.layers(of: report).filter { $0.changed > 0 }.sorted {
            $0.changed == $1.changed ? $0.layer < $1.layer : $0.changed > $1.changed
        }
        let files = Customisation.changedFiles(of: report, includeExpected: showExpected)
        let shown = showAllFiles ? files : Array(files.prefix(Self.collapsedCount))
        let percentage = summary.score.formatted(.percent.precision(.fractionLength(0)))

        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                if summary.scoredChanged == 0 {
                    Label {
                        Text("No kit files edited")
                    } icon: {
                        Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                    }
                } else {
                    Text("\(summary.scoredChanged) of \(summary.scored) kit files edited").font(.headline)
                }
                Spacer()
                Text(percentage).font(.title3.weight(.semibold)).monospacedDigit()
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Customisation \(percentage): \(summary.scoredChanged) of \(summary.scored) kit files edited")
            if !layers.isEmpty, summary.scored > 0 {
                layerBar(layers, total: summary.scored)
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 14) { layerLegend(layers) }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 100), alignment: .leading)], alignment: .leading) {
                        layerLegend(layers)
                    }
                }
            }
        }
        .padding(.vertical, 4)

        DisclosureGroup("Show Edited Files") {
            VStack(alignment: .leading, spacing: 8) {
                fileList(files: files, shown: shown, hiddenExpected: expectedChangeCount(report))
                if stale {
                    Label("Computed for an earlier state of the project. Inspect again to refresh.", systemImage: "clock")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func layerBar(_ layers: [LayerCustomisation], total: Int) -> some View {
        GeometryReader { proxy in
            let gap: CGFloat = 2
            let available = max(0, proxy.size.width - CGFloat(layers.count - 1) * gap)
            let minimum = min(6, available / CGFloat(layers.count))
            let widths = layers.map { available * CGFloat($0.changed) / CGFloat(total) }
            // If minimum widths would overflow the track, shrink only the space above those minima.
            let extra = widths.reduce(CGFloat.zero) { $0 + max(0, $1 - minimum) }
            let scale = extra > 0 ? min(1, (available - minimum * CGFloat(layers.count)) / extra) : 1
            HStack(spacing: gap) {
                ForEach(Array(zip(layers, widths)), id: \.0.id) { layer, width in
                    Capsule()
                        .fill(layerColor(layer))
                        .frame(width: minimum + max(0, width - minimum) * scale)
                        .help(layerHelp(layer))
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            .background(.quaternary, in: .capsule)
        }
        .frame(height: 10)
        .accessibilityHidden(true)
    }

    private func layerLegend(_ layers: [LayerCustomisation]) -> some View {
        ForEach(layers) { layer in
            HStack(spacing: 4) {
                Circle().fill(layerColor(layer)).frame(width: 7, height: 7)
                Text("\(layer.layer.capitalized) \(layer.changed)")
                    .foregroundStyle(.secondary)
            }
            .font(.caption)
            .help(layerHelp(layer))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(layerHelp(layer))
        }
    }

    private func layerColor(_ layer: LayerCustomisation) -> Color {
        layer.layer == ModuleMapping.base ? .blue : ModuleAppearance.color(for: layer.layer)
    }

    private func layerHelp(_ layer: LayerCustomisation) -> String {
        "\(layer.layer): \(layer.edited) edited, \(layer.deleted) deleted of \(layer.scored)"
    }

    @ViewBuilder
    private func fileList(files: [InspectFile], shown: [InspectFile], hiddenExpected: Int) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Edited files").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            if files.isEmpty {
                Text("No edited files to show.").font(.callout).foregroundStyle(.secondary)
            }
            ForEach(shown, id: \.path) { file in
                fileRow(file)
            }
            if files.count > Self.collapsedCount {
                Button(showAllFiles ? "Show fewer" : "Show all \(files.count) files") { showAllFiles.toggle() }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.accentColor)
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
                    .foregroundStyle(isDeleted ? Color.red : Color.accentColor)
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
