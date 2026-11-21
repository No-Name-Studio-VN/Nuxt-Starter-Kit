import Foundation
import Testing

@testable import KitManagerCore

@Suite("Module grouping")
struct ModuleGroupingTests {
    @Test func ordersGroupsAndWalksChildrenDepthFirst() throws {
        let report = ModulesReport(schema: 1, commit: "commit", modules: [
            module("auth-passkeys", group: "Authentication", parent: "auth-password"),
            module("dashboard", group: "App"),
            module("auth-oauth", group: "Authentication", parent: "auth"),
            module("server-core"),
            module("email", group: "Foundation"),
            module("auth-password", group: "Authentication", parent: "auth"),
            module("content-studio", group: "Content", parent: "content"),
            module("auth", group: "Authentication", requiresOneOf: ["auth-password", "auth-oauth"]),
        ], installed: [], groups: ["Foundation", "Authentication", "App", "Content", "Empty"])
        let decoded = try JSONDecoder().decode(ModulesReport.self, from: JSONEncoder().encode(report))
        let auth = try #require(decoded.modules.first { $0.id == "auth" })
        #expect(auth.requiresOneOf == ["auth-password", "auth-oauth"])

        let groups = groupModules(decoded.modules, module: { $0 })
        #expect(groups.map(\.name) == ["Foundation", "Authentication", "App", "Content", nil])
        #expect(groups.map { $0.entries.map(\.id) } == [
            ["email"], ["auth", "auth-oauth", "auth-password", "auth-passkeys"],
            ["dashboard"], ["content-studio"], ["server-core"],
        ])
        #expect(groups.map { $0.entries.map(\.depth) } == [[0], [0, 1, 1, 2], [0], [0], [0]])
    }

    @Test(arguments: ["", #""groups":[],"#])
    func noGroupsPreservesCatalogueOrderWithoutIndenting(groupField: String) throws {
        let report = try JSONDecoder().decode(ModulesReport.self, from: Data("""
            {"schema":1,"commit":"commit",\(groupField)"modules":[
                {"id":"z-child","title":"Child","description":"","group":"App","parent":"a-parent",
                 "requires":["a-parent"],"internal":false,"dependencies":[],"devDependencies":[],
                 "scripts":[],"env":[],"bindings":[],"rootFiles":[]},
                {"id":"a-parent","title":"Parent","description":"","requires":[],"internal":false,
                 "dependencies":[],"devDependencies":[],"scripts":[],"env":[],"bindings":[],"rootFiles":[]}
            ],"installed":[]}
            """.utf8))
        #expect(report.groups.isEmpty)
        #expect(report.modules.allSatisfy { $0.requiresOneOf.isEmpty })
        #expect(report.modules.last?.group == nil)
        #expect(report.modules.last?.parent == nil)

        let groups = groupModules(report.modules, module: { $0 })
        #expect(groups.count == 1)
        let group = try #require(groups.first)
        #expect(group.name == nil)
        #expect(group.entries.map(\.id) == ["z-child", "a-parent"])
        #expect(group.entries.map(\.depth) == [0, 0])
    }

    @Test func separatesUngroupedInternalModulesOnlyWhenRequested() {
        let report = ModulesReport(schema: 1, commit: "commit", modules: [
            module("cache", internal: true),
            module("feature-flags", group: "App"),
            module("legacy"),
            module("kv", internal: true),
            module("email", group: "Foundation", internal: true),
        ], installed: [], groups: ["Foundation", "App"])

        let groups = groupModules(report.modules, showsInternalSection: true, module: { $0 })
        #expect(groups.map(\.name) == ["Foundation", "App", nil, "Internal"])
        #expect(groups.map { $0.entries.map(\.id) } == [["email"], ["feature-flags"], ["legacy"], ["cache", "kv"]])

        let defaultGroups = groupModules(report.modules, module: { $0 })
        #expect(defaultGroups.map(\.name) == ["Foundation", "App", nil])
        #expect(defaultGroups.last?.entries.map(\.id) == ["cache", "legacy", "kv"])
    }

    @Test func showsInternalSectionWithoutKitGroups() {
        let report = ModulesReport(schema: 1, commit: "commit", modules: [
            module("child", parent: "parent"),
            module("kv", internal: true),
            module("parent"),
        ], installed: [])

        let groups = groupModules(report.modules, showsInternalSection: true, module: { $0 })
        #expect(groups.map(\.name) == [nil, "Internal"])
        #expect(groups.map { $0.entries.map(\.id) } == [["child", "parent"], ["kv"]])
        #expect(groups.first?.entries.map(\.depth) == [0, 0])
    }

    @Test func requiredByOnlyIncludesDirectRequirements() {
        let catalogue = [
            module("kv", internal: true),
            module("admin-kv", requires: ["kv"]),
            module("extension", requires: ["admin-kv"]),
            module("feature-flags", requires: ["admin", "kv"]),
            module("optional", requiresOneOf: ["kv", "cache"]),
        ]

        #expect(modulesRequiring("kv", in: catalogue).map(\.id) == ["admin-kv", "feature-flags"])
        #expect(modulesRequiring("cache", in: catalogue).isEmpty)
    }

    private func module(
        _ id: String, group: String? = nil, parent: String? = nil, internal: Bool = false,
        requires: [String]? = nil, requiresOneOf: [String] = []
    ) -> KitModuleInfo {
        KitModuleInfo(
            id: id, title: id, description: "", requires: requires ?? parent.map { [$0] } ?? [], internal: `internal`,
            dependencies: [], devDependencies: [], scripts: [], env: [], bindings: [], rootFiles: [],
            group: group, parent: parent, requiresOneOf: requiresOneOf)
    }
}
