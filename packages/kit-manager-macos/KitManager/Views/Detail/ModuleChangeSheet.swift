import KitManagerCore
import SwiftUI

/// Adds or removes modules in two steps: review the `--check` plan, then apply it.
struct ModuleChangeSheet: View {
    let project: Project

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    /// Fixed when the sheet opens, so applied modules do not disappear from the picker.
    @State private var additions: [ModuleChoice]
    @State private var removals: [ModuleChoice]
    @State private var action: ModuleAction
    @State private var selection: Set<String>
    @State private var phase: ModuleChangePhase = .idle
    @State private var backsUp = true
    @State private var showsRiskFiles = false
    /// Bumped by "Preview Again" to re-run the `--check` for the same selection.
    @State private var planAttempt = 0
    @State private var pickerHeight: CGFloat = 0
    @State private var isResolving = false
    @State private var resolveError: PresentedError?

    init(project: Project, additions: [ModuleChoice], removals: [ModuleChoice], initialRemoval: String?) {
        self.project = project
        _additions = State(initialValue: additions)
        _removals = State(initialValue: removals)
        _action = State(initialValue: initialRemoval != nil || additions.isEmpty ? .remove : .add)
        _selection = State(initialValue: initialRemoval.map { [$0] } ?? [])
    }

    private var choices: [ModuleChoice] { action == .add ? additions : removals }

    private var ids: [String] { selection.sorted() }

    private var reviewedRisk: UpgradeRiskSummary? {
        guard case .planned(let report, _) = phase else { return nil }
        return report.riskSummary
    }

    private var verb: String { action == .add ? "Add" : "Remove" }

    private var isLocked: Bool {
        switch phase {
        case .applying, .applied: true
        case .idle, .previewing, .planned, .failed: false
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section {
                    if !additions.isEmpty && !removals.isEmpty {
                        Picker("Module action", selection: Binding(get: { action }, set: selectAction)) {
                            Text("Add").tag(ModuleAction.add)
                            Text("Remove").tag(ModuleAction.remove)
                        }
                        .pickerStyle(.segmented)
                        .disabled(isLocked)
                    }
                    ScrollView {
                        VStack(alignment: .leading, spacing: 8) {
                            picker
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { pickerHeight = $0 }
                    }
                    .frame(height: min(max(pickerHeight, 1), 190))
                } header: {
                    Text("\(verb) Modules").accessibilityAddTraits(.isHeader)
                }
                Section(resultTitle) {
                    result
                }
            }
            .formStyle(.grouped)
            .disclosureGroupStyle(.row)
            .defaultScrollAnchor(.top, for: .sizeChanges)
            .frame(height: min(formHeight, max(280, (NSScreen.main?.visibleFrame.height ?? 800) - 105)))
            Divider()
            footer.padding(20)
        }
        .frame(width: 540)
        .interactiveDismissDisabled(isApplying)
        .task(id: ModulePlanRequest(action: action, selection: selection, attempt: planAttempt)) { await runPreview() }
    }

    private var formHeight: CGFloat {
        if reviewedRisk?.detail != nil { return showsRiskFiles ? 700 : 610 }
        if case .planned = phase { return 520 }
        return 440
    }

    // MARK: Pieces

    @ViewBuilder
    private var picker: some View {
        if choices.isEmpty {
            Text(action == .add ? "Every module is already installed." : "No removable modules.")
                .foregroundStyle(.secondary)
        }
        ModuleSelectionPicker(choices: choices, selection: $selection)
            .disabled(isLocked)
    }

    private var resultTitle: String {
        switch phase {
        case .planned: "Preview (nothing is changed yet)"
        case .applied: "Changes Applied"
        case .idle, .previewing, .failed, .applying: "Preview"
        }
    }

    @ViewBuilder
    private var result: some View {
        switch phase {
        case .idle:
            Text("Pick at least one module to see what would change.").font(.callout).foregroundStyle(.secondary)
        case .previewing:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Previewing changes…").font(.callout).foregroundStyle(.secondary)
            }
        case .failed(let error):
            FailureView(error)
        case .applying:
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("Applying…").font(.callout).foregroundStyle(.secondary)
            }
        case .planned(let report, _):
            if let risk = report.riskSummary, let unsaved = report.unsaved, risk.risky > 0 {
                TransitionRiskReview(summary: risk, files: unsaved.risky, showsFiles: $showsRiskFiles)
            }
            TransitionBackupToggle(backsUp: $backsUp, hasUnsaved: (report.unsaved?.total ?? 0) > 0, isModuleChange: true)
            TransitionGroupedCounts(counts: report.groupedCounts)
            TransitionReportSummary(report: report, modules: modules(in: report))
        case .applied(let report, _):
            TransitionReportSummary(report: report, modules: modules(in: report))
            if let resolveError { FailureView(resolveError) }
        }
    }

    private func modules(in report: TransitionReport) -> Set<String>? {
        model.snapshots[project.id]?.kitState.map { Set($0.modules + report.addedModules + report.removedModules) }
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
                    .buttonStyle(.glass)
                    .disabled(isResolving)
                }
                Spacer()
                Button("Done") { dismiss() }
                    .buttonStyle(.glassProminent)
                    .keyboardShortcut(.defaultAction)
            } else {
                Button("Cancel", role: .cancel) { dismiss() }
                    .buttonStyle(.glass)
                    .keyboardShortcut(.cancelAction)
                    .disabled(isApplying)
                Spacer()
                if case .failed = phase, !selection.isEmpty {
                    Button("Preview Again") { planAttempt += 1 }
                        .buttonStyle(.glass)
                }
                Button("Apply") { applyPlanned() }
                    .buttonStyle(.glassProminent)
                    .keyboardShortcut(.defaultAction)
                    .disabled(!canApply)
                    .help("Apply the planned change")
            }
        }
    }

    private var isApplying: Bool {
        if case .applying = phase { return true }
        return false
    }

    private var canApply: Bool {
        guard case .planned(_, let planned) = phase else { return false }
        return ids == planned && model.cliStatus == .ready
    }

    // MARK: Actions

    private func selectAction(_ newAction: ModuleAction) {
        guard action != newAction, !isLocked else { return }
        action = newAction
        selection = []
        phase = .idle
    }

    private func runPreview() async {
        if isLocked { return }
        if selection.isEmpty {
            phase = .idle
            return
        }
        phase = .previewing
        showsRiskFiles = false
        let planned = ids
        let plannedAction = action
        let result = await model.previewModuleChange(project, action: plannedAction, ids: planned)
        // A newer selection or action superseded this plan.
        guard !Task.isCancelled, action == plannedAction, ids == planned else { return }
        switch result {
        case .success(let report): phase = .planned(report, ids: planned)
        case .failure(let error): phase = .failed(PresentedError(error))
        }
    }

    /// Applies the plan on screen, with the modules it was made for rather than the live selection.
    private func applyPlanned() {
        guard canApply, case .planned(let report, let planned) = phase else { return }
        phase = .applying
        let plannedAction = action
        let backup = backsUp
        Task {
            switch await model.applyModuleChange(project, action: plannedAction, ids: planned, reviewed: report, backup: backup) {
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
