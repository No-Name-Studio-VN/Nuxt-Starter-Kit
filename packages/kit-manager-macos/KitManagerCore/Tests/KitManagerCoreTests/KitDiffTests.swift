import Foundation
import Testing

@testable import KitManagerCore

private actor DiffRunner: ProcessRunning {
    private var outputs: [String]
    private(set) var calls: [[String]] = []

    init(_ outputs: [String] = []) { self.outputs = outputs }

    func run(_ executable: String, _ arguments: [String], in directory: URL?, timeout: Duration) async throws -> ProcessResult {
        #expect(executable == "git")
        #expect(arguments.prefix(4) == ["--no-optional-locks", "-C", "/tmp/kit", "--no-lazy-fetch"])
        calls.append(Array(arguments.dropFirst(4)))
        let output = try #require(outputs.first)
        outputs.removeFirst()
        return ProcessResult(exitCode: 0, stdout: Data(output.utf8), stderr: Data())
    }

    var repository: KitRepository { KitRepository(root: URL(filePath: "/tmp/kit"), runner: self) }
}

@Suite("Kit diff")
struct KitDiffTests {
    @Test func listWithoutPatchesPreservesRenamePairAndMissingFocusDoesNotRunGit() async throws {
        let base = String(repeating: "b", count: 40)
        let head = String(repeating: "a", count: 40)
        let raw = ":100644 100644 \(base) \(head) R090\0layers/auth/old.ts\0café [new]\nline.ts\0"
        let runner = DiffRunner([head + "\n", base + "\n", raw])
        let comparison = try await runner.repository.prepareDiff(from: "base", to: "head")
        let file = try #require(comparison.file(at: "layers/auth/old.ts"))
        #expect(file.status == .renamed)
        #expect(file.path == "café [new]\nline.ts")
        #expect(file.previousPath == "layers/auth/old.ts")
        #expect(try await comparison.patch(path: "generated.vue") == .missing)
        let calls = await runner.calls
        #expect(calls.count == 3)
        let listing = try #require(calls.last)
        #expect(listing.contains("--raw") && listing.contains("-z"))
        #expect(!listing.contains("--patch"))
        #expect(listing.suffix(3) == [base, head, "--"])
    }

    @Test func moduleScopeKeepsTheWholeRenameWhenOnlyOneSideShips() async throws {
        let base = String(repeating: "b", count: 40)
        let head = String(repeating: "a", count: 40)
        let before = ":100644 100644 \(base) \(head) "
        let raw = before + "R100\0layers/auth/old.ts\0layers/billing/new.ts\0"
            + before + "M\0layers/billing/private.ts\0" + before + "M\0README.md\0" + before + "M\0dev-only.txt\0"
        let runner = DiffRunner([head + "\n", base + "\n", raw])
        let comparison = try await runner.repository.prepareDiff(from: "base", to: "head")
        let scoped = comparison.files(ownedBy: ["auth"], using: ModuleMapping(exclude: ["dev-only.txt"], modules: []))
        #expect(scoped.map(\.path) == ["layers/billing/new.ts", "README.md"])
        #expect(scoped.first?.previousPath == "layers/auth/old.ts")
    }

    @Test func refusesSymlinkBlobBeforeRequestingAPatch() async throws {
        let base = String(repeating: "b", count: 40)
        let head = String(repeating: "a", count: 40)
        let runner = DiffRunner([head + "\n", base + "\n", ":100644 120000 \(base) \(head) T\0link.txt\0"])
        let comparison = try await runner.repository.prepareDiff(from: "base", to: "head")
        #expect(try await comparison.patch(path: "link.txt") == .unavailable)
        #expect(await runner.calls.count == 3)
    }

    @Test func rejectsOptionLikeRevisionsBeforeInvokingGit() async throws {
        let runner = DiffRunner()
        let repository = await runner.repository
        await #expect(throws: GitError.self) { try await repository.prepareDiff(from: nil, to: "--all") }
        await #expect(throws: GitError.self) { try await repository.prepareDiff(from: "--all", to: "head") }
        #expect(await runner.calls.isEmpty)
    }

    @Test func oversizedBlobIsRejectedBeforeRequestingAPatch() async throws {
        let base = String(repeating: "b", count: 40)
        let head = String(repeating: "a", count: 40)
        let runner = DiffRunner([head + "\n", base + "\n", ":100644 100644 \(base) \(head) M\0huge.txt\0", "10001\n"])
        let comparison = try await runner.repository.prepareDiff(from: "base", to: "head")
        #expect(try await comparison.patch(path: "huge.txt", maxBytes: 10000) == .tooLarge)
        #expect(await runner.calls.last == ["cat-file", "-s", base])
        #expect(await runner.calls.count == 4)
    }

    @Test func selectedRenameKeepsBothPathsAndDoesNotReadOtherChanges() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try await git(temp.url, ["init"])
        try temp.write("old [page].html", "<p>before</p>\n" + String(repeating: "unchanged marker\n", count: 20))
        try temp.write("unrelated.html", "unrelated before\n")
        try await git(temp.url, ["add", "."])
        try await git(temp.url, ["commit", "-m", "base"])
        try await git(temp.url, ["mv", "--", "old [page].html", "--new [page].html"])
        try temp.write("--new [page].html", "</script><script>sample</script>\n" + String(repeating: "unchanged marker\n", count: 20))
        try temp.write("unrelated.html", "unrelated after\n")
        try await git(temp.url, ["commit", "-am", "next"])
        let repository = KitRepository(root: temp.url, runner: realRunner)
        let comparison = try await repository.prepareDiff(from: "HEAD^", to: "HEAD")
        let rename = try #require(comparison.file(at: "--new [page].html"))
        #expect(rename.previousPath == "old [page].html")
        guard case .text(let patch) = try await comparison.patch(path: rename.path) else {
            Issue.record("Expected a rename patch")
            return
        }
        #expect(patch.contains("rename from old [page].html"))
        #expect(patch.contains("rename to --new [page].html"))
        #expect(patch.contains("\n+</script><script>sample</script>\n"))
        #expect(!patch.contains("unrelated"))
    }

    @Test func selectedPathDoesNotMatchFormerDirectoryContents() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try await git(temp.url, ["init"])
        try temp.write("page/index.vue", "do not display this other file\n")
        try await git(temp.url, ["add", "."])
        try await git(temp.url, ["commit", "-m", "base"])
        try await git(temp.url, ["rm", "-r", "page"])
        try temp.write("page", "new regular file\n")
        try await git(temp.url, ["add", "page"])
        try await git(temp.url, ["commit", "-m", "next"])
        let repository = KitRepository(root: temp.url, runner: realRunner)
        let comparison = try await repository.prepareDiff(from: "HEAD^", to: "HEAD")
        guard case .text(let patch) = try await comparison.patch(path: "page") else {
            Issue.record("Expected the selected file's patch")
            return
        }
        #expect(patch.contains("\n+new regular file\n"))
        #expect(!patch.contains("index.vue"))
    }

    @Test func binaryAndOutputOverBudgetReturnSummariesWithoutPartialPatch() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try await git(temp.url, ["init"])
        try temp.write("binary.bin", "\0before")
        try temp.write("text.txt", String(repeating: "a", count: 120) + "\n")
        try await git(temp.url, ["add", "."])
        try await git(temp.url, ["commit", "-m", "base"])
        try temp.write("binary.bin", "\0after")
        try temp.write("text.txt", String(repeating: "b", count: 120) + "\n")
        try await git(temp.url, ["commit", "-am", "next"])
        let repository = KitRepository(root: temp.url, runner: realRunner)
        let comparison = try await repository.prepareDiff(from: "HEAD^", to: "HEAD")
        #expect(try await comparison.patch(path: "binary.bin") == .binary)
        #expect(try await comparison.patch(path: "text.txt", maxBytes: 160) == .tooLarge)
    }

    @Test func boundedProcessStopsAnUnendingOutputStream() async {
        await #expect(throws: ProcessError.outputLimitExceeded) {
            try await realRunner.run("yes", [], in: nil, timeout: .seconds(5), outputLimit: 1024)
        }
    }

    @Test func rootAndMergeUseTheirCorrectBasesEvenIfTheRefMoves() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        try await git(temp.url, ["init"])
        try temp.write("base.txt", "base\n")
        try await git(temp.url, ["add", "."])
        try await git(temp.url, ["commit", "-m", "root"])
        try await git(temp.url, ["tag", "root"])
        try await git(temp.url, ["switch", "-c", "feature"])
        try temp.write("café.html", "<p>Hello</p>\n")
        try await git(temp.url, ["add", "."])
        try await git(temp.url, ["commit", "-m", "feature"])
        try await git(temp.url, ["switch", "main"])
        try await git(temp.url, ["merge", "--no-ff", "feature", "-m", "merge"])
        let repository = KitRepository(root: temp.url, runner: realRunner)
        let root = try await repository.prepareDiff(from: nil, to: "root")
        let merge = try await repository.prepareDiff(from: nil, to: "HEAD")
        await #expect(throws: GitError.self) {
            try await repository.prepareDiff(from: "HEAD^..HEAD", to: "no-such-revision")
        }
        try temp.write("café.html", "different commit\n")
        try await git(temp.url, ["commit", "-am", "third"])
        #expect(root.files.map(\.path) == ["base.txt"])
        #expect(merge.files.map(\.path) == ["café.html"])
        guard case .text(let rootPatch) = try await root.patch(path: "base.txt"),
            case .text(let mergePatch) = try await merge.patch(path: "café.html")
        else {
            Issue.record("Expected patches for the listed files")
            return
        }
        #expect(rootPatch.contains("\n+base\n"))
        #expect(mergePatch.contains("\n+<p>Hello</p>\n"))
        #expect(!mergePatch.contains("different commit"))
    }

    @MainActor
    @Test func ignoredSupersededResultAndRetainedPatchOnLayoutOnlyRefresh() async {
        let state = FileDiffSelection()
        let first = DiffFile(path: "first", status: .modified)
        let second = DiffFile(path: "second", status: .deleted)
        let began = AsyncStream<Void>.makeStream()
        let finish = AsyncStream<Void>.makeStream()
        let delayed = Task {
            await state.load(first) { _ in
                began.continuation.finish()
                for await _ in finish.stream {}
                return .text("stale")
            }
        }
        for await _ in began.stream {}
        await state.load(second) { _ in .text("current") }
        finish.continuation.finish()
        await delayed.value
        #expect(state.patch(for: first) == .idle)
        #expect(state.patch(for: second) == .loaded(.text("current"), stale: false))

        // Rendering the same selection with another layout must reuse its patch.
        await state.load(second) { _ in
            Issue.record("Reloaded a patch for the same selection")
            return .text("reloaded")
        }
        #expect(state.patch(for: second) == .loaded(.text("current"), stale: false))
    }
}
