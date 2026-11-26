import Foundation
import Testing

@testable import KitManagerCore

private struct KitFixture {
    let temp: TempDirectory
    let work: URL
    let shas: [String]

    var repository: KitRepository { KitRepository(root: work, runner: realRunner) }
}

private func commitFiles(_ work: URL, _ files: [String], message: String) async throws -> String {
    for file in files {
        let url = work.appending(path: file)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("\(message)\n".utf8).write(to: url, options: .atomic)
    }
    try await git(work, ["add", "-A"])
    try await git(work, ["commit", "-m", message])
    return try await git(work, ["rev-parse", "HEAD"]).trimmingCharacters(in: .whitespacesAndNewlines)
}

/// A bare "origin" with a clone that holds four commits (tag v1.0.0 on the first), all pushed.
private func makeKitFixture() async throws -> KitFixture {
    let temp = try TempDirectory()
    let origin = temp.url.appending(path: "origin.git")
    try FileManager.default.createDirectory(at: origin, withIntermediateDirectories: true)
    try await git(origin, ["init", "--bare"])
    let work = temp.url.appending(path: "work")
    try await git(temp.url, ["clone", origin.path, "work"])

    var shas: [String] = []
    shas.append(try await commitFiles(work, ["layers/auth-2fa/x.ts"], message: "feat(auth-2fa): a"))
    try await git(work, ["tag", "v1.0.0"])
    shas.append(try await commitFiles(work, ["content/doc.md"], message: "fix(content): b"))
    shas.append(try await commitFiles(work, ["docs/x.md", "CLAUDE.md"], message: "docs: c"))
    shas.append(try await commitFiles(work, ["app/app.vue"], message: "chore: d"))
    try await git(work, ["push", "origin", "main", "--tags"])
    return KitFixture(temp: temp, work: work, shas: shas)
}

private func moduleInfo(_ id: String, rootFiles: [String] = []) -> KitModuleInfo {
    KitModuleInfo(
        id: id, title: id, description: "", requires: [], internal: false, dependencies: [],
        devDependencies: [], scripts: [], env: [], bindings: [], rootFiles: rootFiles)
}

private func makeMapping() -> ModuleMapping {
    ModuleMapping(
        exclude: ["docs/**", "CLAUDE.md"],
        modules: [moduleInfo("auth-2fa"), moduleInfo("content", rootFiles: ["content/**"])])
}

private actor RecordingRunner: ProcessRunning {
    private(set) var calls: [[String]] = []

    func run(_ executable: String, _ arguments: [String], in directory: URL?, timeout: Duration) async throws -> ProcessResult {
        calls.append(arguments)
        return ProcessResult(exitCode: 0, stdout: Data(), stderr: Data())
    }
}

@Suite("Kit repository")
struct KitTests {
    // MARK: Parsing

    @Test func parsesDescribe() {
        #expect(KitRepository.parseDescribe("v3.0.1") == "v3.0.1")
        #expect(KitRepository.parseDescribe("v3.0.1\n") == "v3.0.1")
        #expect(KitRepository.parseDescribe("v3.0.1-4-gabc1234") == "v3.0.1 +4")
        #expect(KitRepository.parseDescribe("v1.0.0-beta-2-gabc1234") == "v1.0.0-beta +2")
        #expect(KitRepository.parseDescribe("garbage") == nil)
        #expect(KitRepository.parseDescribe("") == nil)
    }

    @Test func parsesConventional() {
        let breaking = KitRepository.parseConventional("feat(auth)!: x")
        #expect(breaking.type == "feat")
        #expect(breaking.scope == "auth")
        #expect(breaking.breaking)

        let plain = KitRepository.parseConventional("docs: c")
        #expect(plain.type == "docs")
        #expect(plain.scope == nil)
        #expect(!plain.breaking)

        let bang = KitRepository.parseConventional("fix!: y")
        #expect(bang.type == "fix")
        #expect(bang.scope == nil)
        #expect(bang.breaking)

        let merge = KitRepository.parseConventional("Merge branch")
        #expect(merge.type == nil)
        #expect(merge.scope == nil)
        #expect(!merge.breaking)
    }

    // MARK: Glob

    @Test func globMatchesKitPatterns() {
        #expect(Glob("server/db/migrations/**").matches("server/db/migrations/0001.sql"))
        #expect(Glob("server/db/migrations/**").matches("server/db/migrations/meta/_journal.json"))
        #expect(!Glob("server/db/migrations/**").matches("server/db/schema.ts"))
        #expect(Glob("CLAUDE.md").matches("CLAUDE.md"))
        #expect(!Glob("CLAUDE.md").matches("docs/CLAUDE.md"))
        #expect(!Glob("CLAUDE.md").matches("claude.md"))
        #expect(Glob("test/**/*.test.ts").matches("test/a/b.test.ts"))
        #expect(Glob("test/**/*.test.ts").matches("test/a.test.ts"))
        #expect(!Glob("test/**/*.test.ts").matches("test/a/b.spec.ts"))
        #expect(Glob("*.md").matches("README.md"))
        #expect(!Glob("*.md").matches("docs/x.md"))
        #expect(Glob("**/*.md").matches("docs/deep/x.md"))
        #expect(Glob("**/*.md").matches("x.md"))
        #expect(Glob("a?c").matches("abc"))
        #expect(!Glob("a?c").matches("a/c"))
        #expect(!Glob("a?c").matches("ac"))
    }

    @Test func globMatchesDotFilesAndRealExcludes() {
        #expect(Glob(".claude/**").matches(".claude/settings.json"))
        #expect(Glob(".husky/_/**").matches(".husky/_/husky.sh"))
        #expect(Glob(".github/workflows/release.yml").matches(".github/workflows/release.yml"))
        #expect(!Glob(".github/workflows/release.yml").matches(".github/workflows/ci.yml"))
        #expect(Glob("pnpm-lock.yaml").matches("pnpm-lock.yaml"))
        #expect(Glob("packages/**").matches("packages/kit-manager-macos/Package.swift"))
        #expect(Glob("test/fixtures/**").matches("test/fixtures/blog-routes/content/blogs/route-tests/nested.md"))
        #expect(!Glob("test/fixtures/**").matches("test/unit/setup/h3Globals.ts"))
        #expect(Glob("CLAUDE.MD").matches("CLAUDE.MD"))
        #expect(Glob("*").matches(".env"))
        #expect(!Glob("*").matches("a/b"))
        #expect(Glob("a/**/b").matches("a/b"))
        #expect(Glob("a/**/b").matches("a/x/y/b"))
        #expect(Glob("**").matches("anything/at/all"))
    }

    // MARK: Mapping

    @Test func mappingHonoursExcludeAndRootFiles() {
        let mapping = makeMapping()
        #expect(mapping.modules(for: ["layers/auth-2fa/x.ts"]) == ["auth-2fa"])
        #expect(mapping.modules(for: ["content/doc.md"]) == ["content"])
        #expect(mapping.modules(for: ["docs/x.md", "CLAUDE.md"]).isEmpty)
        #expect(mapping.modules(for: ["app/app.vue"]) == ["base"])
        #expect(
            mapping.modules(for: ["layers/auth-2fa/x.ts", "content/doc.md", "docs/x.md", "app/app.vue"])
                == ["auth-2fa", "content", "base"])
        #expect(mapping.modules(for: []).isEmpty)
    }

    @Test func ownedPathsKeepBaseAndInstalledModulesWithoutExcludedPaths() {
        let mapping = makeMapping()
        let paths = ["docs/x.md", "layers/auth-2fa/x.ts", "app/app.vue", "content/doc.md", "CLAUDE.md"]
        #expect(mapping.paths(paths, ownedBy: ["auth-2fa"]) == ["layers/auth-2fa/x.ts", "app/app.vue"])
        #expect(mapping.paths(paths, ownedBy: ["content"]) == ["app/app.vue", "content/doc.md"])
        #expect(mapping.paths(paths, ownedBy: []) == ["app/app.vue"])
    }

    // MARK: Relevance

    @Test func relevanceUsesBaseAndInstalledModules() {
        func commit(_ modules: Set<String>) -> KitCommit {
            KitCommit(
                id: "a", subject: "s", type: nil, scope: nil, breaking: false,
                date: Date(timeIntervalSince1970: 0), modules: modules)
        }
        #expect(commit(["base"]).isRelevant(to: []))
        #expect(commit(["content"]).isRelevant(to: ["content", "auth"]))
        #expect(!commit(["content"]).isRelevant(to: ["auth"]))
        #expect(!commit([]).isRelevant(to: ["auth", "content"]))
    }

    // MARK: KitConfig

    @Test func kitConfigToleratesMissingUserOwned() throws {
        let config = try JSONDecoder().decode(KitConfig.self, from: Data(#"{"exclude":[]}"#.utf8))
        #expect(config.exclude.isEmpty)
        #expect(config.userOwned == nil)
        let full = try JSONDecoder().decode(
            KitConfig.self, from: Data(#"{"exclude":["a"],"userOwned":["b"]}"#.utf8))
        #expect(full.userOwned == ["b"])
    }

    // MARK: Repository

    @Test func versionLabelAndBehind() async throws {
        let fixture = try await makeKitFixture()
        defer { fixture.temp.remove() }
        let repository = fixture.repository
        try await repository.fetch()

        #expect(await repository.versionLabel(for: fixture.shas[0]) == "v1.0.0")
        #expect(await repository.versionLabel(for: fixture.shas[3]) == "v1.0.0 +3")
        #expect(try await repository.commitsBehind(fixture.shas[0]) == 3)
        #expect(try await repository.commitsBehind(fixture.shas[3]) == 0)
        #expect(try await repository.latestMain() == fixture.shas[3])
        #expect(await repository.availability(of: fixture.shas[1]) == .onMain)
    }

    @Test func fetchFollowsTheSpecWithoutPruning() async throws {
        let runner = RecordingRunner()
        try await KitRepository(root: URL(filePath: "/tmp/kit"), runner: runner).fetch()
        #expect(await runner.calls == [["--no-optional-locks", "-C", "/tmp/kit", "fetch", "origin", "--tags"]])
    }

    @Test func fetchPicksUpNewOriginCommits() async throws {
        let fixture = try await makeKitFixture()
        defer { fixture.temp.remove() }
        let other = fixture.temp.url.appending(path: "other")
        let origin = fixture.temp.url.appending(path: "origin.git")
        try await git(fixture.temp.url, ["clone", origin.path, "other"])
        let newSha = try await commitFiles(other, ["app/new.vue"], message: "feat: e")
        try await git(other, ["push", "origin", "main"])

        let repository = fixture.repository
        #expect(try await repository.latestMain() == fixture.shas[3])
        try await repository.fetch()
        #expect(try await repository.latestMain() == newSha)
    }

    @Test func commitsAreMappedAndFilteredByRelevance() async throws {
        let fixture = try await makeKitFixture()
        defer { fixture.temp.remove() }
        let repository = fixture.repository
        try await repository.fetch()

        let commits = try await repository.commits(from: fixture.shas[0], mapping: makeMapping())
        #expect(commits.map(\.subject) == ["chore: d", "docs: c", "fix(content): b"])
        #expect(commits.map(\.id) == [fixture.shas[3], fixture.shas[2], fixture.shas[1]])

        let byType = Dictionary(uniqueKeysWithValues: commits.map { ($0.type ?? "", $0) })
        #expect(byType["fix"]?.scope == "content")
        #expect(byType["fix"]?.modules == ["content"])
        #expect(byType["docs"]?.modules.isEmpty == true)
        #expect(byType["chore"]?.modules == ["base"])

        let relevant = commits.filter { $0.isRelevant(to: ["content"]) }
        #expect(relevant.map(\.subject) == ["chore: d", "fix(content): b"])
    }

    @Test func changelogGroupsCommitsUnderTags() async throws {
        let fixture = try await makeKitFixture()
        defer { fixture.temp.remove() }
        // Two release tags on one commit, a tag that is not a release, and one commit past them.
        try await git(fixture.work, ["tag", "v1.1.0", fixture.shas[2]])
        try await git(fixture.work, ["tag", "-a", "-m", "release", "v1.10.0", fixture.shas[2]])
        try await git(fixture.work, ["tag", "nightly", fixture.shas[3]])
        try await git(fixture.work, ["push", "origin", "--tags"])
        let repository = fixture.repository
        try await repository.fetch()

        let sections = try await repository.changelog(from: fixture.shas[0], mapping: makeMapping())
        #expect(sections.map(\.tag) == [nil, "v1.10.0"])
        #expect(sections.map { $0.commits.map(\.subject) } == [["chore: d"], ["docs: c", "fix(content): b"]])
    }

    @Test func releaseTagsListOnlyVersionTags() async throws {
        let fixture = try await makeKitFixture()
        defer { fixture.temp.remove() }
        try await git(fixture.work, ["tag", "v1.1.0", fixture.shas[1]])
        try await git(fixture.work, ["tag", "release-candidate", fixture.shas[2]])
        // Starts with "v" but is not a version.
        try await git(fixture.work, ["tag", "vendor-x", fixture.shas[1]])
        try await git(fixture.work, ["tag", "vendor-y", fixture.shas[3]])
        try await git(fixture.work, ["push", "origin", "--tags"])
        let repository = fixture.repository
        try await repository.fetch()

        let tags = try await repository.releaseTags(from: fixture.shas[0])
        #expect(tags == [fixture.shas[1]: ["v1.1.0"]])
        await #expect(throws: GitError.self) { try await repository.releaseTags(from: "--all") }
    }

    @Test func kitConfigIsReadFromRef() async throws {
        let fixture = try await makeKitFixture()
        defer { fixture.temp.remove() }
        _ = try await commitFiles(
            fixture.work, ["packages/create-nuxt-saas/kit.json"], message: "chore: config")
        try Data(#"{"exclude":["docs/**"],"userOwned":["package.json"]}"#.utf8).write(
            to: fixture.work.appending(path: "packages/create-nuxt-saas/kit.json"))
        try await git(fixture.work, ["commit", "-am", "chore: real config"])
        try await git(fixture.work, ["push", "origin", "main"])

        let repository = fixture.repository
        try await repository.fetch()
        let config = try await repository.kitConfig(at: "origin/main")
        #expect(config.exclude == ["docs/**"])
        #expect(config.userOwned == ["package.json"])
        await #expect(throws: GitError.self) { try await repository.kitConfig(at: fixture.shas[0]) }
    }

    @Test func unknownCommitIsNotOnMain() async throws {
        let fixture = try await makeKitFixture()
        defer { fixture.temp.remove() }
        let repository = fixture.repository
        try await repository.fetch()

        let unknown = String(repeating: "ab12", count: 10)
        #expect(await repository.availability(of: unknown) == .notOnMain)
        #expect(await repository.versionLabel(for: unknown) == nil)

        try await git(fixture.work, ["switch", "-c", "feature"])
        let local = try await commitFiles(fixture.work, ["app/local.vue"], message: "feat: local")
        #expect(await repository.availability(of: local) == .notOnMain)
        #expect(await repository.availability(of: "--all") == .notOnMain)
        #expect(await repository.versionLabel(for: "--all") == nil)
    }

    @Test func historyFailuresThrowReadableErrors() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let repository = KitRepository(root: temp.url, runner: realRunner)
        await #expect(throws: GitError.self) { try await repository.latestMain() }
        await #expect(throws: GitError.self) { try await repository.commitsBehind("--all") }
        await #expect(throws: GitError.self) {
            try await repository.commits(from: "--all", mapping: makeMapping())
        }
        #expect(await repository.availability(of: String(repeating: "a", count: 40)) == .notOnMain)
        #expect(await repository.versionLabel(for: String(repeating: "a", count: 40)) == nil)
    }
}
