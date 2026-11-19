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
    private let patchArgs = [
        "--literal-pathspecs", "-c", "core.quotePath=false", "diff", "--no-color", "--no-ext-diff", "--no-textconv",
        "--no-relative", "--ignore-submodules=none", "--submodule=short", "-M", "--raw", "-z", "--patch",
        "--src-prefix=a/", "--dst-prefix=b/",
    ]
    private let emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
    private let rawEntry = ":100644 100644 1234567 abcdef0 M\0"

    @Test func singleCommitUsesTheFirstParentOfAMerge() async throws {
        let runner = DiffRunner(["tree treeid\nparent first\nparent second\nauthor Test\n\nMerge\n", ""])
        _ = try await runner.repository.diff(from: nil, to: "head", limitedTo: nil, maxBytes: 1_500_000)
        #expect(await runner.calls == [["cat-file", "commit", "head^{commit}"], patchArgs + ["first", "head^{commit}", "--"]])
    }

    @Test func rootCommitUsesTheEmptyTree() async throws {
        let runner = DiffRunner(["tree treeid\nauthor Test\n\nparent not-a-parent\n", emptyTree + "\n", ""])
        _ = try await runner.repository.diff(from: nil, to: "root", limitedTo: nil, maxBytes: 1_500_000)
        #expect(await runner.calls == [
            ["cat-file", "commit", "root^{commit}"], ["hash-object", "-t", "tree", "--stdin"],
            patchArgs + [emptyTree, "root^{commit}", "--"],
        ])
    }

    @Test func rangeUsesBothRevisions() async throws {
        let runner = DiffRunner([""])
        _ = try await runner.repository.diff(from: "base", to: "head", limitedTo: nil, maxBytes: 1_500_000)
        #expect(await runner.calls == [patchArgs + ["base^{commit}", "head^{commit}", "--"]])
    }

    @Test func limitedDiffUsesLiteralPathsAfterTheSeparator() async throws {
        let runner = DiffRunner([""])
        _ = try await runner.repository.diff(from: "base", to: "head", limitedTo: ["a b.vue", "--stat", ":(glob)*"], maxBytes: 1024)
        #expect(await runner.calls == [patchArgs + ["base^{commit}", "head^{commit}", "--", "a b.vue", "--stat", ":(glob)*"]])
    }

    @Test func emptyScopeDoesNotFallBackToAllPaths() async throws {
        let runner = DiffRunner()
        let result = try await runner.repository.diff(from: "base", to: "head", limitedTo: [], maxBytes: 1024)
        #expect(result == KitDiff(text: "", files: [], isTruncated: false))
        #expect(await runner.calls.isEmpty)
    }

    @Test func rejectsLeadingDashRevisionsBeforeInvokingGit() async throws {
        let runner = DiffRunner()
        let repository = await runner.repository
        await #expect(throws: GitError.self) {
            try await repository.diff(from: nil, to: "--all", limitedTo: [], maxBytes: 1024)
        }
        await #expect(throws: GitError.self) { try await repository.changedPaths(from: "--all", to: "head") }
        #expect(await runner.calls.isEmpty)
    }

    @Test func changedPathsKeepsLiteralNamesAndBothSidesOfRenamesForScoping() async throws {
        let runner = DiffRunner(["layers/auth/x.ts\0with a space\0café\nnext line\0"])
        let paths = try await runner.repository.changedPaths(from: "base", to: "head")
        #expect(paths == ["layers/auth/x.ts", "with a space", "café\nnext line"])
        #expect(await runner.calls == [[
            "diff", "--no-color", "--no-ext-diff", "--no-textconv", "--no-relative", "--ignore-submodules=none",
            "--submodule=short", "--no-renames", "--name-only", "-z", "base^{commit}", "head^{commit}", "--",
        ]])
    }

    @Test func truncatesAtAFileBoundaryInBytesWithoutSplittingUnicode() async throws {
        let first = "diff --git a/a b/a\n@@ -1 +1 @@\n-before\n+café\n"
        let second = "diff --git a/b b/b\n@@ -1 +1 @@\n-before\n+abcdef\n"
        let runner = DiffRunner([rawEntry + "a\0" + rawEntry + "b\0\0" + first + second])
        let result = try await runner.repository.diff(from: "base", to: "head", limitedTo: nil, maxBytes: first.utf8.count)
        #expect(result == KitDiff(text: first, files: ["a"], isTruncated: true))
    }

    @Test func giantFirstFileReturnsAnEmptyButTruncatedPatch() async throws {
        let patch = "diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml\n@@ -1 +1,50001 @@\n-before\n"
            + String(repeating: "+  some-long-dependency-with-a-version@1.2.3:\n", count: 50_000)
        let runner = DiffRunner([rawEntry + "pnpm-lock.yaml\0\0" + patch])
        let result = try await runner.repository.diff(from: "base", to: "head", limitedTo: nil, maxBytes: 1_500_000)
        #expect(result == KitDiff(text: "", files: [], isTruncated: true))
    }

    @Test func patchPreservesScriptLikeTextAndReportsRenameDestination() async throws {
        let patch = "diff --git a/old.html b/new.html\n@@ -1 +1 @@\n-old\n+</script><script>sample</script>\n"
        let runner = DiffRunner([":100644 100644 1234567 abcdef0 R090\0old.html\0new.html\0\0" + patch])
        let result = try await runner.repository.diff(from: "base", to: "head", limitedTo: nil, maxBytes: patch.utf8.count)
        #expect(result == KitDiff(text: patch, files: ["new.html"], isTruncated: false))
    }

    @Test func realRootAndMergeProduceStandardPatches() async throws {
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
        let root = try await repository.diff(from: nil, to: "root", limitedTo: nil, maxBytes: 1024)
        #expect(root.text.hasPrefix("diff --git a/base.txt b/base.txt\n"))
        #expect(root.text.contains("\n+base\n"))
        #expect(root.files == ["base.txt"])
        let merge = try await repository.diff(from: nil, to: "HEAD", limitedTo: nil, maxBytes: 1024)
        #expect(merge.files == ["café.html"])
        #expect(merge.text.contains("\n+<p>Hello</p>\n"))
        #expect(try await repository.changedPaths(from: nil, to: "HEAD") == ["café.html"])
    }
}
