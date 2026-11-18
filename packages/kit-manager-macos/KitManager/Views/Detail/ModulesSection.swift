import KitManagerCore
import SwiftUI

/// Installed modules with their descriptions, and Add… / Remove, which open `ModuleChangeSheet`.
struct ModulesSection: View {
    let project: Project
    let snapshot: ProjectSnapshot

    @Environment(AppModel.self) private var model
    @State private var request: Request?

    private struct Request: Identifiable {
        let id = UUID()
        let action: ModuleAction
        let initial: Set<String>
    }

    private var installed: [String] { snapshot.kitState?.modules ?? [] }

    private var catalogue: [String: KitModuleInfo] {
        Dictionary(model.catalogue.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    }

    private var available: [ModuleChoice] {
        model.catalogue
            .filter { !$0.internal && !installed.contains($0.id) }
            .map { ModuleChoice(id: $0.id, title: $0.title, detail: $0.description) }
    }

    private var removable: [ModuleChoice] {
        installed.compactMap { id in
            let info = catalogue[id]
            if info?.internal == true { return nil }
            return ModuleChoice(id: id, title: info?.title ?? id, detail: info?.description ?? "")
        }
    }

    private var canChange: Bool { model.cliStatus == .ready }

    var body: some View {
        GlassCard("Modules") {
            VStack(alignment: .leading, spacing: 12) {
                if let dirty = snapshot.git?.dirtyCount, dirty > 0 {
                    AmberNote(
                        "\(dirty) uncommitted change\(dirty == 1 ? "" : "s"). You can preview a module change, but applying needs a clean tree.")
                }
                if installed.isEmpty {
                    Text("No modules installed.").font(.callout).foregroundStyle(.secondary)
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(installed.enumerated()), id: \.element) { index, id in
                            if index > 0 { Divider() }
                            row(id)
                        }
                    }
                }
                if model.catalogue.isEmpty {
                    Text("Descriptions and available modules load once the nuxt-saas CLI is ready.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else {
                    Text("\(available.count) more available")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        } trailing: {
            Button {
                request = Request(action: .add, initial: [])
            } label: {
                Label("Add…", systemImage: "plus")
            }
            .quietGlassButton()
            .disabled(!canChange || available.isEmpty)
            .help(canChange ? "Add modules" : "Build the nuxt-saas CLI first")
        }
        .sheet(item: $request) { request in
            ModuleChangeSheet(
                project: project, action: request.action,
                choices: request.action == .add ? available : removable, initial: request.initial)
        }
    }

    private func row(_ id: String) -> some View {
        let info = catalogue[id]
        let isRemovable = removable.contains { $0.id == id }
        return HStack(alignment: .top, spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(info?.title ?? id).font(.callout.weight(.medium))
                    if info?.title != nil && info?.title != id {
                        Text(id).font(.caption.monospaced()).foregroundStyle(.secondary)
                    }
                }
                if let description = info?.description, !description.isEmpty {
                    Text(description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            if isRemovable {
                Button {
                    request = Request(action: .remove, initial: [id])
                } label: {
                    Text("Remove").font(.caption)
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .accessibilityLabel("Remove \(info?.title ?? id)")
                .disabled(!canChange)
                .help("Remove \(info?.title ?? id)")
            }
        }
        .padding(.vertical, 7)
        .accessibilityElement(children: .contain)
    }
}
