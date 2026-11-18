import KitManagerCore
import SwiftUI

/// Adds or removes modules in two steps: the `--check` plan first, then Apply. Apply never forces
/// and is disabled while the working tree has uncommitted changes.
struct ModuleChangeSheet: View {
    let project: Project
    let action: ModuleAction

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    /// Fixed when the sheet opens, so ticked rows do not vanish once the change is applied.
    @State private var choices: [ModuleChoice]
    @State private var selection: Set<String>
    @State private var phase: ModuleChangePhase = .idle
    /// Bumped by "Plan again" to re-run the `--check` for the same selection.
    @State private var planAttempt = 0
    @State private var pickerHeight: CGFloat = 0
    @State private var isResolving = false
    @State private var resolveError: PresentedError?

    init(project: Project, action: ModuleAction, choices: [ModuleChoice], initial: Set<String>) {
        self.project = project
        self.action = action
        _choices = State(initialValue: choices)
        _selection = State(initialValue: initial)
    }

    private struct PlanRequest: Hashable {
        let selection: Set<String>
        let attempt: Int
    }

    private var ids: [String] { selection.sorted() }

    private var dirtyCount: Int { model.snapshots[project.id]?.git?.dirtyCount ?? 0 }

    private var verb: String { action == .add ? "Add" : "Remove" }

    private var isLocked: Bool {
        switch phase {
        case .applying, .applied: true
        case .idle, .previewing, .planned, .failed: false
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("\(verb) modules").font(.title2.weight(.semibold)).accessibilityAddTraits(.isHeader)
            ScrollView {
                picker
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { pickerHeight = $0 }
            }
            .frame(height: min(max(pickerHeight, 1), 200))
            Divider().overlay(Theme.hairline)
            ScrollView {
                result.frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(minHeight: 120, maxHeight: 300)
            footer
        }
        .padding(20)
        .frame(width: 540)
        .background(Theme.canvas)
        .task(id: PlanRequest(selection: selection, attempt: planAttempt)) { await runPreview() }
    }

    // MARK: Pieces

    private var picker: some View {
        VStack(alignment: .leading, spacing: 6) {
            if choices.isEmpty {
                Text(action == .add ? "Every module is already installed." : "No removable modules.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            ForEach(choices) { choice in
                Toggle(isOn: binding(for: choice.id)) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(choice.title).font(.callout.weight(.medium))
                        if !choice.detail.isEmpty {
                            Text(choice.detail).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .toggleStyle(.checkbox)
                .disabled(isLocked)
            }
        }
    }

    private func binding(for id: String) -> Binding<Bool> {
        Binding(
            get: { selection.contains(id) },
            set: { isOn in
                if isOn { selection.insert(id) } else { selection.remove(id) }
            })
    }

    @ViewBuilder
    private var result: some View {
        switch phase {
        case .idle:
            Text("Pick at least one module to see what would change.").font(.callout).foregroundStyle(.secondary)
        case .previewing:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Planning with --check…").font(.callout).foregroundStyle(.secondary)
            }
        case .failed(let error):
            FailureView(error)
        case .applying:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Applying…").font(.callout).foregroundStyle(.secondary)
            }
        case .planned(let report, _):
            reportView(report, applied: false)
        case .applied(let report, _):
            reportView(report, applied: true)
        }
    }

    private func reportView(_ report: TransitionReport, applied: Bool) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(applied ? "Applied" : "Plan (nothing is changed yet)")
                .font(.caption.weight(.semibold))
                .tracking(0.8)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
            TransitionReportSummary(report: report)
            if let resolveError { FailureView(resolveError) }
        }
    }

    private var footer: some View {
        HStack(spacing: 10) {
            if case .applied(let report, let appliedIDs) = phase {
                if !report.conflicts.isEmpty {
                    Button {
                        resolve(report, ids: appliedIDs)
                    } label: {
                        Label("Resolve with Claude", systemImage: "sparkles")
                    }
                    .buttonStyle(.glassProminent)
                    .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
                    .disabled(isResolving)
                }
                Spacer()
                Button("Done") { dismiss() }
                    .buttonStyle(.glass)
                    .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
                    .keyboardShortcut(.defaultAction)
            } else {
                if dirtyCount > 0 {
                    AmberNote("Commit or stash your changes first")
                }
                Spacer()
                Button("Cancel", role: .cancel) { dismiss() }
                    .buttonStyle(.glass)
                    .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
                    .keyboardShortcut(.cancelAction)
                    .disabled(isApplying)
                if case .failed = phase, !selection.isEmpty {
                    Button("Plan again") { planAttempt += 1 }
                        .buttonStyle(.glass)
                        .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
                }
                Button("Apply") { applyPlanned() }
                    .buttonStyle(.glassProminent)
                    .buttonBorderShape(.roundedRectangle(radius: Theme.radius))
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canApply)
                    .help(dirtyCount > 0 ? "Commit or stash your changes first" : "Apply the planned change")
            }
        }
    }

    private var isApplying: Bool {
        if case .applying = phase { return true }
        return false
    }

    private var canApply: Bool {
        guard dirtyCount == 0 else { return false }
        if case .planned = phase { return true }
        return false
    }

    // MARK: Actions

    private func runPreview() async {
        if isLocked { return }
        if selection.isEmpty {
            phase = .idle
            return
        }
        phase = .previewing
        let planned = ids
        let result = await model.previewModuleChange(project, action: action, ids: planned)
        // A newer selection cancelled this one.
        guard !Task.isCancelled else { return }
        switch result {
        case .success(let report): phase = .planned(report, ids: planned)
        case .failure(let error): phase = .failed(PresentedError(error))
        }
    }

    /// Applies the plan on screen, with the modules it was made for rather than the live selection.
    private func applyPlanned() {
        guard case .planned(_, let planned) = phase else { return }
        phase = .applying
        Task {
            switch await model.applyModuleChange(project, action: action, ids: planned) {
            case .success(let report): phase = .applied(report, ids: planned)
            case .failure(let error): phase = .failed(PresentedError(error))
            }
        }
    }

    private func resolve(_ report: TransitionReport, ids: [String]) {
        isResolving = true
        resolveError = nil
        Task {
            do {
                try await model.resolveModuleConflicts(project, report: report, action: action, ids: ids)
            } catch {
                resolveError = PresentedError(error)
            }
            isResolving = false
        }
    }
}
