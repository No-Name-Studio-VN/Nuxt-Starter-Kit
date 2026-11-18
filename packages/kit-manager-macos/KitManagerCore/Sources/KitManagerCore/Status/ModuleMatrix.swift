import Foundation

/// The modules matrix (spec 2.11): which kit v3 projects have which module, and which of those
/// are behind on a commit that touched it.
public enum ModuleMatrix {
    public struct Column: Sendable, Equatable, Identifiable {
        public let id: UUID
        public let snapshot: ProjectSnapshot

        public init(id: UUID, snapshot: ProjectSnapshot) {
            self.id = id
            self.snapshot = snapshot
        }

        public var installed: Set<String> { Set(snapshot.kitState?.modules ?? []) }
    }

    public struct Row: Sendable, Equatable, Identifiable {
        public let module: KitModuleInfo
        public let installed: Set<UUID>
        public let behind: Set<UUID>

        public var id: String { module.id }
        public var installedCount: Int { installed.count }
        public var behindCount: Int { behind.count }
    }

    /// Kit v3 projects only; kit-source folders and every other kind are not columns.
    public static func columns(from projects: [(id: UUID, snapshot: ProjectSnapshot)]) -> [Column] {
        projects
            .filter { $0.snapshot.kitState != nil && !$0.snapshot.isKitSource }
            .map { Column(id: $0.id, snapshot: $0.snapshot) }
    }

    /// One row per catalogue module, in catalogue order. A project is behind on a module when it
    /// has it installed and its pending changelog holds a commit that touched it.
    public static func rows(catalogue: [KitModuleInfo], columns: [Column]) -> [Row] {
        catalogue.map { module in
            let installed = columns.filter { $0.installed.contains(module.id) }
            let behind = installed.filter { column in
                column.snapshot.changelog.contains { $0.modules.contains(module.id) }
            }
            return Row(module: module, installed: Set(installed.map(\.id)), behind: Set(behind.map(\.id)))
        }
    }
}
