import Foundation
import Testing

@testable import KitManagerCore

/// A throwaway directory removed by `remove()`.
private struct TempDirectory {
    let url: URL

    init() throws {
        // Resolve symlinks so the paths match what git reports.
        let base = FileManager.default.temporaryDirectory.resolvingSymlinksInPath()
        url = base.appending(path: "kit-manager-project-tests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    }

    func write(_ relativePath: String, _ contents: String) throws {
        let file = url.appending(path: relativePath)
        try FileManager.default.createDirectory(
            at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data(contents.utf8).write(to: file)
    }

    func remove() {
        try? FileManager.default.removeItem(at: url)
    }
}

private let sha = "bead6d4c1e7989d369942a70c35cba50c187006d"

private func stateJSON(version: Int = 3, commit: String = sha) -> String {
    """
    {"version":\(version),"kit":"github:No-Name-Studio-VN/Nuxt-Starter-Kit","commit":"\(commit)",\
    "modules":["auth","billing"],"identity":{"name":"Acme","description":"Acme app"},"conflicts":[]}
    """
}

private let nuxtPackage = #"{"name":"site","devDependencies":{"nuxt":"^4.0.0"}}"#

private let realRunner = ProcessRunner(environment: ShellEnvironment(path: ShellEnvironment.fallbackPath))

/// Runs real git with hooks, signing and identity pinned so a developer's global config cannot interfere.
@discardableResult
private func git(_ directory: URL, _ arguments: [String]) async throws -> String {
    let pinned = [
        "-c", "core.hooksPath=/dev/null", "-c", "commit.gpgsign=false",
        "-c", "user.name=Kit Tester", "-c", "user.email=kit@example.com",
        "-c", "init.defaultBranch=main",
    ]
    let result = try await realRunner.run("git", pinned + arguments, in: directory, timeout: .seconds(30))
    #expect(result.exitCode == 0, "git \(arguments.joined(separator: " ")): \(String(decoding: result.stderr, as: UTF8.self))")
    return String(decoding: result.stdout, as: UTF8.self)
}

private func makeRepository(in temp: TempDirectory, named name: String = "repo") async throws -> URL {
    let repo = temp.url.appending(path: name)
    try FileManager.default.createDirectory(at: repo, withIntermediateDirectories: true)
    try await git(repo, ["init"])
    return repo
}

private func commitFile(_ repo: URL, _ name: String, _ contents: String = "x") async throws {
    try Data(contents.utf8).write(to: repo.appending(path: name))
    try await git(repo, ["add", "-A"])
    try await git(repo, ["commit", "-m", "add \(name)"])
}

/// Answers every request by host: `up.test` gets a 200 to HEAD, anything else fails to connect.
private final class StubURLProtocol: URLProtocol {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url, request.httpMethod == "HEAD", url.host() == "up.test",
            let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)
        else {
            client?.urlProtocol(self, didFailWithError: URLError(.cannotConnectToHost))
            return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

@Suite("Project inspection")
struct ProjectTests {
    // MARK: Classification

    @Test func classifiesKitV3() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try temp.write(".nuxt-saas.json", stateJSON())
        let kind = ProjectClassifier.classify(temp.url)
        guard case .kitV3(let state) = kind else {
            Issue.record("expected kitV3, got \(kind)")
            return
        }
        #expect(state.commit == sha)
        #expect(state.modules == ["auth", "billing"])
        #expect(state.identity == KitIdentity(name: "Acme", description: "Acme app"))
    }

    @Test func classifiesLegacy() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try temp.write(".nuxt-saas/manifest.json", "{}")
        try temp.write("package.json", nuxtPackage)
        #expect(ProjectClassifier.classify(temp.url) == .kitLegacy)
    }

    @Test func classifiesNuxtFromDevDependencies() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try temp.write("package.json", nuxtPackage)
        #expect(ProjectClassifier.classify(temp.url) == .nuxt)
    }

    @Test func classifiesOther() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try temp.write("package.json", #"{"name":"lib","dependencies":{"vue":"3"}}"#)
        #expect(ProjectClassifier.classify(temp.url) == .other)
        let empty = try TempDirectory()
        defer { empty.remove() }
        #expect(ProjectClassifier.classify(empty.url) == .other)
    }

    @Test func classifiesMissingDirectory() {
        let gone = FileManager.default.temporaryDirectory.appending(path: "kit-manager-gone-\(UUID().uuidString)")
        #expect(ProjectClassifier.classify(gone) == .missing)
    }

    @Test func invalidStateReportsDecodeError() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try temp.write(".nuxt-saas.json", stateJSON(commit: "abc"))
        guard case .invalidState(let message) = ProjectClassifier.classify(temp.url) else {
            Issue.record("expected invalidState")
            return
        }
        #expect(message.contains("commit"))
    }

    @Test func invalidStateRejectsWrongVersionAndBrokenJSON() throws {
        let wrongVersion = try TempDirectory()
        defer { wrongVersion.remove() }
        try wrongVersion.write(".nuxt-saas.json", stateJSON(version: 2))
        guard case .invalidState(let versionMessage) = ProjectClassifier.classify(wrongVersion.url) else {
            Issue.record("expected invalidState for version")
            return
        }
        #expect(versionMessage.contains("version"))

        let broken = try TempDirectory()
        defer { broken.remove() }
        try broken.write(".nuxt-saas.json", #"{"version":3,"kit":"k"}"#)
        guard case .invalidState(let missingMessage) = ProjectClassifier.classify(broken.url) else {
            Issue.record("expected invalidState for missing keys")
            return
        }
        #expect(missingMessage.contains("commit"))
    }

    @Test func readsPackageInfo() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try temp.write(
            "package.json",
            #"{"name":"site","dependencies":{"a":"1"},"devDependencies":{"b":"2"},"scripts":{"test":"x","build":"y"}}"#)
        #expect(
            PackageReader.read(temp.url)
                == PackageInfo(name: "site", dependencies: ["a", "b"], scripts: ["test", "build"]))
        let empty = try TempDirectory()
        defer { empty.remove() }
        #expect(PackageReader.read(empty.url) == nil)
    }

    // MARK: Env

    @Test func envKeysHandlesRealWorldSyntax() {
        let text = "# c\nexport A=1\nB = \"x=y\"\n\nC='q'\nA=2\n  D=\n#E=1"
        #expect(EnvKeys.keys(in: text) == ["A", "B", "C", "D"])
    }

    @Test func envKeysHandlesWindowsLineEndings() {
        #expect(EnvKeys.keys(in: "A=1\r\nB=2\r\n") == ["A", "B"])
    }

    @Test func envCheckMissingEnvFile() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try temp.write(".env.example", "B=\nA=\n")
        #expect(EnvKeys.check(temp.url) == EnvCheck(hasExample: true, hasEnv: false, missing: ["A", "B"]))
    }

    @Test func envCheckReportsOnlyAbsentKeys() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try temp.write(".env.example", "A=\nB=\nC=\n")
        try temp.write(".env", "export A=secret\nC=other\nEXTRA=1\n")
        #expect(EnvKeys.check(temp.url) == EnvCheck(hasExample: true, hasEnv: true, missing: ["B"]))
    }

    @Test func envCheckWithoutExampleHasNothingMissing() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try temp.write(".env", "A=1\n")
        #expect(EnvKeys.check(temp.url) == EnvCheck(hasExample: false, hasEnv: true, missing: []))
    }

    // MARK: Wrangler

    @Test func wranglerParsesCommentsAndCustomDomain() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try temp.write(
            "wrangler.jsonc",
            """
            {
              // the worker
              "name": "acme-app",
              /* block comment */
              "routes": [
                { "pattern": "other.example.com/*" },
                { "pattern": "app.example.com", "custom_domain": true, },
              ],
            }
            """)
        let info = WranglerInfo.read(temp.url)
        #expect(info?.workerName == "acme-app")
        #expect(info?.routes == ["other.example.com/*", "app.example.com"])
        #expect(info?.productionURL == URL(string: "https://app.example.com"))
    }

    @Test func wranglerFallsBackToFirstRouteAndPlainJSON() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try temp.write("wrangler.json", #"{"name":"w","route":"example.com/*"}"#)
        let info = WranglerInfo.read(temp.url)
        #expect(info?.productionURL == URL(string: "https://example.com"))
        #expect(info?.routes == ["example.com/*"])
    }

    @Test func wranglerWithoutRoutesOrFile() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        #expect(WranglerInfo.read(temp.url) == nil)
        try temp.write("wrangler.jsonc", #"{"name":"w"}"#)
        #expect(WranglerInfo.read(temp.url) == WranglerInfo(workerName: "w", routes: [], productionURL: nil))
    }

    // MARK: Git

    @Test func gitStatusReportsBranchDirtyAheadBehind() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let origin = try await makeRepository(in: temp, named: "origin")
        try await commitFile(origin, "a.txt")
        let work = temp.url.appending(path: "work")
        try await git(temp.url, ["clone", origin.path, work.path])
        try await commitFile(work, "b.txt")
        try Data("new".utf8).write(to: work.appending(path: "untracked.txt"))

        let status = try await GitInspector(runner: realRunner).status(work)
        let head = try await git(work, ["rev-parse", "HEAD"]).trimmingCharacters(in: .whitespacesAndNewlines)
        #expect(status.branch == "main")
        #expect(status.head == head)
        #expect(status.dirtyCount == 1)
        #expect(status.ahead == 1)
        #expect(status.behind == 0)
        #expect(status.lastCommitDate != nil)
    }

    @Test func gitStatusCountsRenamesOnce() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let repo = try await makeRepository(in: temp)
        try await commitFile(repo, "old name.txt", "content that is long enough to detect a rename")
        try await git(repo, ["mv", "old name.txt", "new name.txt"])
        let status = try await GitInspector(runner: realRunner).status(repo)
        #expect(status.dirtyCount == 1)
        #expect(status.ahead == nil)
        #expect(status.behind == nil)
    }

    @Test func gitStatusOfRepositoryWithoutCommits() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let repo = try await makeRepository(in: temp)
        let inspector = GitInspector(runner: realRunner)
        let status = try await inspector.status(repo)
        #expect(status.head == nil)
        #expect(status.branch == "main")
        #expect(status.lastCommitDate == nil)
        #expect(try await inspector.fingerprint(repo).count == 64)
    }

    @Test func gitStatusThrowsOutsideARepository() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let inspector = GitInspector(runner: realRunner)
        await #expect(throws: GitError.self) { try await inspector.status(temp.url) }
        await #expect(throws: GitError.self) { try await inspector.fingerprint(temp.url) }
    }

    @Test func fingerprintChangesWhenDirtyFileEditedAgain() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let repo = try await makeRepository(in: temp)
        try await commitFile(repo, "a.txt")
        let inspector = GitInspector(runner: realRunner)
        let clean = try await inspector.fingerprint(repo)
        #expect(try await inspector.fingerprint(repo) == clean)

        let dirty = repo.appending(path: "a.txt")
        try Data("one".utf8).write(to: dirty)
        let first = try await inspector.fingerprint(repo)
        #expect(first != clean)

        // Same size, different mtime: only the stat signature distinguishes the two edits.
        try Data("two".utf8).write(to: dirty)
        try FileManager.default.setAttributes([.modificationDate: Date(timeIntervalSinceNow: 60)], ofItemAtPath: dirty.path)
        let second = try await inspector.fingerprint(repo)
        #expect(second != first)

        try await git(repo, ["commit", "-am", "edit"])
        let committed = try await inspector.fingerprint(repo)
        #expect(committed != second)
    }

    @Test func fingerprintSeesEditsInsideUntrackedDirectory() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let repo = try await makeRepository(in: temp)
        try await commitFile(repo, "a.txt")
        try FileManager.default.createDirectory(at: repo.appending(path: "dir"), withIntermediateDirectories: true)
        let file = repo.appending(path: "dir/new.txt")
        try Data("one".utf8).write(to: file)
        let inspector = GitInspector(runner: realRunner)
        let first = try await inspector.fingerprint(repo)
        try Data("longer".utf8).write(to: file)
        #expect(try await inspector.fingerprint(repo) != first)
    }

    @Test func branchOperations() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let repo = try await makeRepository(in: temp)
        try await commitFile(repo, "a.txt")
        let inspector = GitInspector(runner: realRunner)

        #expect(try await inspector.localBranches(repo) == ["main"])
        try await inspector.createAndSwitch(repo, branch: "kit-upgrade/v3.1.0")
        #expect(try await inspector.localBranches(repo) == ["main", "kit-upgrade/v3.1.0"])
        #expect(try await inspector.status(repo).branch == "kit-upgrade/v3.1.0")
        try await inspector.switchTo(repo, branch: "main")
        try await inspector.deleteBranch(repo, branch: "kit-upgrade/v3.1.0")
        #expect(try await inspector.localBranches(repo) == ["main"])
    }

    @Test func branchOperationsRejectOptionLikeNamesAndSurfaceGitErrors() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let repo = try await makeRepository(in: temp)
        try await commitFile(repo, "a.txt")
        let inspector = GitInspector(runner: realRunner)
        await #expect(throws: GitError.invalidBranchName("--force")) {
            try await inspector.createAndSwitch(repo, branch: "--force")
        }
        await #expect(throws: GitError.self) { try await inspector.switchTo(repo, branch: "missing") }
    }

    // MARK: Scan

    @Test func scanFindsCandidatesAndSkipsNodeModules() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try temp.write("a/.nuxt-saas.json", stateJSON())
        try temp.write("b/package.json", nuxtPackage)
        try temp.write("node_modules/c/package.json", nuxtPackage)
        try temp.write("x/y/z/package.json", nuxtPackage)
        try temp.write("plain/package.json", #"{"name":"p"}"#)

        let candidates = ScanService.scan(temp.url)
        #expect(candidates.map(\.url.lastPathComponent) == ["a", "b"])
        guard case .kitV3 = candidates.first?.kind else {
            Issue.record("expected a to be kitV3")
            return
        }
        #expect(candidates.last?.kind == .nuxt)
    }

    @Test func scanReachesDepthTwoAndDoesNotDescendIntoProjects() throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try temp.write("group/app/package.json", nuxtPackage)
        try temp.write("mono/package.json", nuxtPackage)
        try temp.write("mono/packages/inner/package.json", nuxtPackage)
        // The scanner standardizes paths (/var -> /private/var), so compare from the temp folder's own name.
        let marker = temp.url.lastPathComponent + "/"
        let names = ScanService.scan(temp.url).compactMap { $0.url.path.components(separatedBy: marker).last }
        #expect(names == ["group/app", "mono"])
    }

    // MARK: Health

    @Test func healthCheckerReportsStatus() async throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        let checker = HealthChecker(session: URLSession(configuration: configuration))

        let up = await checker.check(try #require(URL(string: "https://up.test/")))
        #expect(up.statusCode == 200)
        #expect(up.isUp)
        #expect(up.error == nil)
        #expect(up.latency != nil)

        let down = await checker.check(try #require(URL(string: "https://down.test/")))
        #expect(!down.isUp)
        #expect(down.statusCode == nil)
        #expect(down.error != nil)
    }

    @Test func siteHealthIsUpOnlyFor2xxAnd3xx() {
        #expect(SiteHealth(statusCode: 301, latency: nil, error: nil).isUp)
        #expect(!SiteHealth(statusCode: 500, latency: nil, error: nil).isUp)
        #expect(!SiteHealth(statusCode: nil, latency: nil, error: "x").isUp)
    }
}
