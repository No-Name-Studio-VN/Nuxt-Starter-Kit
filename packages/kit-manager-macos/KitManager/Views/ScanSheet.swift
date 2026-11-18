import KitManagerCore
import SwiftUI

/// A checklist of the projects a folder scan found. Already-added folders are listed but disabled.
struct ScanSheet: View {
    let candidates: [ScanCandidate]
    let knownPaths: Set<String>

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    @State private var chosen: Set<URL> = []

    private var addable: [ScanCandidate] {
        candidates.filter { !knownPaths.contains($0.url.path) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Scan results").font(.title3.weight(.semibold))

            if candidates.isEmpty {
                ContentUnavailableView(
                    "No projects found", systemImage: "magnifyingglass",
                    description: Text("Looked two folders deep for kit and Nuxt projects."))
            } else {
                List(candidates, id: \.url) { candidate in
                    row(candidate)
                }
                .listStyle(.bordered)
                .frame(minHeight: 220)
            }

            HStack {
                if !addable.isEmpty {
                    Button(chosen.count == addable.count ? "Select None" : "Select All") {
                        chosen = chosen.count == addable.count ? [] : Set(addable.map(\.url))
                    }
                    .buttonStyle(.link)
                }
                Spacer()
                Button("Cancel", role: .cancel) { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button(chosen.count > 1 ? "Add \(chosen.count) Projects" : "Add Project") {
                    model.add(urls: Array(chosen))
                    dismiss()
                }
                .buttonStyle(.glassProminent)
                .keyboardShortcut(.defaultAction)
                .disabled(chosen.isEmpty)
            }
        }
        .padding(20)
        .frame(width: 560)
        .onAppear { chosen = Set(addable.map(\.url)) }
    }

    private func row(_ candidate: ScanCandidate) -> some View {
        let added = knownPaths.contains(candidate.url.path)
        return Toggle(
            isOn: Binding(
                get: { chosen.contains(candidate.url) },
                set: { isOn in
                    if isOn { chosen.insert(candidate.url) } else { chosen.remove(candidate.url) }
                })
        ) {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(candidate.url.lastPathComponent).fontWeight(.medium)
                    Text((candidate.url.path as NSString).abbreviatingWithTildeInPath)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                Spacer()
                Text(added ? "Already added" : kindLabel(candidate.kind))
                    .font(.caption.weight(.medium))
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(Theme.hairline.opacity(0.55), in: .rect(cornerRadius: 4))
            }
        }
        .toggleStyle(.checkbox)
        .disabled(added)
    }

    private func kindLabel(_ kind: ProjectKind) -> String {
        switch kind {
        case .kitV3: "Kit 3"
        case .kitLegacy: "Kit 2.x"
        case .nuxt: "Nuxt"
        case .other: "Other"
        case .missing: "Missing"
        case .invalidState: "Invalid state"
        }
    }
}
