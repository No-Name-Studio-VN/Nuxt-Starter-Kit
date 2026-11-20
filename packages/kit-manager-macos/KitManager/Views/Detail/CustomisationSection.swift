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
    /// Distinct hues in order of layer size, so neighbouring bar segments never share a colour (module
    /// icon colours repeat: several modules are blue or gray).
    private static let palette: [Color] = [.blue, .orange, .green, .purple, .pink, .teal, .yellow, .indigo, .mint, .brown, .cyan]

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
        let colors = Dictionary(
            uniqueKeysWithValues: layers.enumerated().map { ($1.layer, Self.palette[$0 % Self.palette.count]) }
        )

        VStack(alignment: .leading, spacing: 12) {
            overview(summary, layers: layers)
            if !layers.isEmpty, summary.scored > 0 {
                CustomisationBar(
                    layers: layers, score: summary.score,
                    color: { colors[$0.layer] ?? .gray }, help: layerHelp
                )
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 16) { layerLegend(layers, colors: colors) }
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), alignment: .leading)], alignment: .leading) {
                        layerLegend(layers, colors: colors)
                    }
                }
            }
            if stale {
                Label("Computed for an earlier state of the project. Inspect again to refresh.", systemImage: "clock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)

        DisclosureGroup {
            fileList(files: files, shown: shown, colors: colors, hiddenExpected: expectedChangeCount(report))
        } label: {
            HStack(spacing: 6) {
                Text("Edited Files")
                Text("\(files.count)")
                    .font(.caption.weight(.semibold).monospacedDigit())
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .background(.fill.tertiary, in: .capsule)
                    .accessibilityLabel(files.count == 1 ? "1 file" : "\(files.count) files")
            }
        }
    }

    @ViewBuilder
    private func overview(_ summary: InspectSummary, layers: [LayerCustomisation]) -> some View {
        let percentage = summary.score.formatted(.percent.precision(.fractionLength(0)))
        if summary.scoredChanged == 0 {
            HStack(spacing: 12) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 30))
                    .foregroundStyle(.white, .green)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text("No kit files edited").font(.headline)
                    Text("Updates apply without merging.").font(.callout).foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .combine)
        } else {
            let edited = layers.reduce(0) { $0 + $1.edited }
            let deleted = layers.reduce(0) { $0 + $1.deleted }
            let breakdown = [
                edited > 0 ? "\(edited) edited" : nil,
                deleted > 0 ? "\(deleted) deleted" : nil,
            ].compactMap(\.self).joined(separator: " · ")
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(percentage)
                    .font(.system(size: 34, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .contentTransition(.numericText())
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(summary.scoredChanged) of \(summary.scored) kit files changed").font(.headline)
                    if !breakdown.isEmpty {
                        Text(breakdown).font(.callout).foregroundStyle(.secondary)
                    }
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("Customisation \(percentage): \(summary.scoredChanged) of \(summary.scored) kit files changed. \(breakdown)")
        }
    }

    private func layerLegend(_ layers: [LayerCustomisation], colors: [String: Color]) -> some View {
        ForEach(layers) { layer in
            HStack(spacing: 5) {
                Circle().fill(colors[layer.layer] ?? .gray).frame(width: 8, height: 8)
                Text(layerTitle(layer.layer))
                    .lineLimit(1)
                Text("\(layer.changed)")
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            .font(.caption)
            .help(layerHelp(layer))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(layerHelp(layer))
        }
    }

    /// The module's name from the kit catalogue, falling back to its id.
    private func layerTitle(_ layer: String) -> String {
        if layer == ModuleMapping.base { return "Base" }
        return model.catalogue.first { $0.id == layer }?.title ?? layer.capitalized
    }

    private func layerHelp(_ layer: LayerCustomisation) -> String {
        "\(layerTitle(layer.layer)): \(layer.edited) edited, \(layer.deleted) deleted of \(layer.scored) files"
    }

    @ViewBuilder
    private func fileList(
        files: [InspectFile], shown: [InspectFile], colors: [String: Color], hiddenExpected: Int
    ) -> some View {
        if files.isEmpty {
            Text("No edited files to show.").font(.callout).foregroundStyle(.secondary)
        } else {
            VStack(alignment: .leading, spacing: 4) {
                ForEach(shown, id: \.path) { file in
                    EditedFileRow(
                        file: file,
                        layerTitle: file.layer == ModuleMapping.base ? nil : layerTitle(file.layer),
                        layerColor: colors[file.layer] ?? .gray
                    ) {
                        Task { await model.openInVSCode(project, relativePath: file.path) }
                    }
                }
            }
        }
        if files.count > Self.collapsedCount || hiddenExpected > 0 || showExpected {
            HStack(spacing: 12) {
                if hiddenExpected > 0 || showExpected {
                    Toggle("Include files meant to be edited (\(hiddenExpected))", isOn: $showExpected)
                        .toggleStyle(.checkbox)
                        .font(.caption)
                }
                Spacer(minLength: 0)
                if files.count > Self.collapsedCount {
                    Button(showAllFiles ? "Show Fewer" : "Show All \(files.count)") {
                        withAnimation(.snappy) { showAllFiles.toggle() }
                    }
                    .buttonStyle(.glass)
                    .controlSize(.small)
                }
            }
            .padding(.top, 4)
        }
    }

    /// Edited or deleted files that projects are meant to change, which the default list hides.
    private func expectedChangeCount(_ report: InspectReport) -> Int {
        Customisation.changedFiles(of: report, includeExpected: true).count
            - Customisation.changedFiles(of: report).count
    }
}
