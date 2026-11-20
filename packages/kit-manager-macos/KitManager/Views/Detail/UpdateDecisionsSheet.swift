import KitManagerCore
import SwiftUI

/// Walks through pending conflicts, or reviews one file selected from the report.
struct UpdateDecisionsSheet: View {
    let project: Project
    let startingAt: String?

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var pending: [Decision] = []
    @State private var skipped: Set<String> = []
    @State private var resolved: Set<String> = []
    @State private var isLoading = true
    @State private var loadFailed = false
    @State private var error: PresentedError?
    @State private var choice: DecisionChoice?

    private var remaining: [Decision] { pending.filter { !skipped.contains($0.path) } }
    private var current: Decision? { remaining.first }
    private var completed: Int { resolved.count + skipped.count }

    var body: some View {
        VStack(spacing: 0) {
            Form {
                if let current, !loadFailed {
                    Section {
                        file(current)
                    } header: {
                        HStack {
                            Text("Walk Through Decisions").accessibilityAddTraits(.isHeader)
                            Spacer()
                            Text("\(completed + 1) of \(completed + remaining.count)")
                                .monospacedDigit().foregroundStyle(.secondary)
                        }
                    }
                    if !current.notes.isEmpty {
                        Section("Kit Changes") {
                            ForEach(current.notes) { note in
                                LabeledContent {
                                    ToneBadge(title: note.kind.displayTitle, tone: note.kind.tone, symbol: note.kind.symbol)
                                } label: {
                                    Text(note.title)
                                }
                                .accessibilityElement(children: .combine)
                            }
                        }
                    }
                    Section {
                        ForEach(DecisionChoice.available(for: current), id: \.self) { option in
                            choiceRow(option, for: current)
                        }
                    } header: {
                        Text("Your Choice").accessibilityAddTraits(.isHeader)
                    } footer: {
                        if let reason = current.suggestion?.reason {
                            Text(reason).font(.callout).foregroundStyle(.secondary)
                        }
                    }
                    .disabled(isLoading)
                    if let error {
                        Section { failure(error) }
                    }
                } else {
                    Section("Walk Through Decisions") {
                        if isLoading {
                            ProgressView("Checking decisions…").controlSize(.small)
                        } else if let error {
                            failure(error)
                        } else if skipped.isEmpty {
                            Label("No decisions left to review.", systemImage: "checkmark.circle.fill")
                        } else {
                            let count = pending.count { skipped.contains($0.path) }
                            Label("You still have \(count) skipped \(count == 1 ? "decision" : "decisions").", systemImage: "forward")
                            Button("Review Skipped") {
                                skipped.removeAll()
                                Task { await load() }
                            }
                            .buttonStyle(.glass)
                        }
                    }
                }
            }
            .formStyle(.grouped)
            .disclosureGroupStyle(.row)
            .frame(height: current == nil ? 225 : 480)
            Divider()
            footer.padding(20)
        }
        .frame(width: 540)
        .interactiveDismissDisabled(isLoading)
        .task { await load() }
        .onChange(of: current?.path, initial: true) {
            choice = current.flatMap(suggestedChoice)
        }
    }

    private func file(_ decision: Decision) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(decision.path)
                .font(.headline.monospaced()).textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
            ToneBadge(title: decision.kind.displayTitle.capitalized, tone: decision.kind.tone, symbol: decision.kind.symbol)
        }
    }

    private func failure(_ error: PresentedError) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            FailureView(error)
            Button("Try Again", systemImage: "arrow.clockwise") { Task { await load() } }
                .buttonStyle(.glass)
                .disabled(isLoading)
        }
    }

    private func choiceRow(_ option: DecisionChoice, for decision: Decision) -> some View {
        let isSelected = choice == option
        let isSuggested = suggestedChoice(for: decision) == option
        let isEnabled = option.isEnabled(for: decision)
        return Button {
            choice = option
        } label: {
            HStack(spacing: 10) {
                Image(systemName: isSelected ? "largecircle.fill.circle" : "circle")
                    .font(.title3)
                    .foregroundStyle(isSelected ? Color.accentColor : .secondary)
                    .accessibilityHidden(true)
                SettingsIcon(symbol: option.symbol, color: option.color)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(option.title).fontWeight(.medium)
                    Text(isEnabled ? option.detail : "The kit doesn't have a version of this file.")
                        .font(.caption).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                if isSuggested {
                    ToneBadge(title: "Suggested", tone: .accent, symbol: "sparkle")
                }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityHint(isSuggested ? "Suggested" : "")
    }

    /// The suggested choice, when it can be applied to this file.
    private func suggestedChoice(for decision: Decision) -> DecisionChoice? {
        guard let action = decision.suggestion?.action, let suggested = DecisionChoice(action),
            DecisionChoice.available(for: decision).contains(suggested), suggested.isEnabled(for: decision)
        else { return nil }
        return suggested
    }

    private var footer: some View {
        HStack(spacing: 10) {
            if let current, !loadFailed {
                Button("Open in Editor", systemImage: "chevron.left.forwardslash.chevron.right") { open(current) }
                    .buttonStyle(.glass)
                    .disabled(isLoading)
                Button("Skip") {
                    skipped.insert(current.path)
                    error = nil
                }
                .buttonStyle(.glass)
                .disabled(isLoading)
            }
            Spacer()
            if isLoading, current != nil { ProgressView().controlSize(.small) }
            Button(current == nil ? "Done" : "Close") { dismiss() }
                .buttonStyle(.glass)
                .keyboardShortcut(.cancelAction)
                .disabled(isLoading)
            if let current, !loadFailed {
                Button("Apply") {
                    if let choice { resolve(current, choice: choice) }
                }
                .buttonStyle(.glassProminent)
                .keyboardShortcut(.defaultAction)
                .disabled(isLoading || choice == nil)
            }
        }
    }

    private func load() async {
        isLoading = true
        error = nil
        defer { isLoading = false }
        do {
            updatePending(try await model.updateDecisions(project))
            loadFailed = false
        } catch let failure {
            guard !Task.isCancelled else { return }
            error = PresentedError(failure)
            loadFailed = true
        }
    }

    private func updatePending(_ decisions: [Decision]) {
        pending = decisions.filter { decision in
            decision.pending && (startingAt.map { decision.path == $0 } ?? (decision.kind == .conflict))
        }
        skipped.formIntersection(pending.map(\.path))
    }

    private func resolve(_ decision: Decision, choice: DecisionChoice) {
        isLoading = true
        error = nil
        Task {
            do {
                let decisions = try await model.resolveUpdateDecision(
                    project, path: decision.path, action: choice.action, decline: choice.declinesFeature)
                resolved.insert(decision.path)
                updatePending(decisions)
            } catch let failure {
                error = PresentedError(failure)
                loadFailed = true
            }
            isLoading = false
        }
    }

    private func open(_ decision: Decision) {
        error = nil
        Task {
            do {
                try await model.openProjectFileInVSCode(project, relativePath: decision.path)
            } catch let failure {
                error = PresentedError(failure)
            }
        }
    }
}
