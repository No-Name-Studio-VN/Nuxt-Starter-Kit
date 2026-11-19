import Foundation
import Testing

@testable import KitManagerCore

@Suite("Repository web URLs")
struct RemoteWebURLTests {
    @Test(arguments: [
        "https://github.com/o/r.git",
        "git@github.com:o/r.git",
        "ssh://git@github.com/o/r",
        "ssh://git@github.com:22/o/r.git",
        "https://user:token@github.com/o/r.git",
        "https://user:token@GITHUB.COM/o/r.git?access_token=secret#secret",
    ])
    func normalizesGitHubRemotes(_ remote: String) {
        #expect(RemoteWebURL.repository(fromRemote: remote)?.absoluteString == "https://github.com/o/r")
    }

    @Test func keepsNestedGroupsAndWebPorts() {
        #expect(
            RemoteWebURL.repository(fromRemote: "git@gitlab.com:g/sub/r.git")?.absoluteString
                == "https://gitlab.com/g/sub/r")
        #expect(
            RemoteWebURL.repository(fromRemote: "https://git.example.com:8443/team/r.git/")?.absoluteString
                == "https://git.example.com:8443/team/r")
    }

    @Test(arguments: [
        "", "/local/path", "../local/path", "file:///local/path", "git@github-work:o/r.git",
        "ssh://git@github-work/o/r.git", "https://github.com/", "https://github.com/../r.git",
    ])
    func rejectsLocalPathsAliasesAndMissingRepositoryPaths(_ remote: String) {
        #expect(RemoteWebURL.repository(fromRemote: remote) == nil)
    }

    @Test func linksToGitHubCommitsAndComparisons() throws {
        let repository = try #require(URL(string: "https://github.com/o/r"))
        #expect(RemoteWebURL.commit("abcd", in: repository).absoluteString == "https://github.com/o/r/commit/abcd")
        #expect(
            RemoteWebURL.compare(from: "abcd", to: "ef01", in: repository).absoluteString
                == "https://github.com/o/r/compare/abcd...ef01")
        #expect(
            RemoteWebURL.compare(from: "release/v1", to: "feature#2", in: repository).absoluteString
                == "https://github.com/o/r/compare/release%2Fv1...feature%232")
    }

    @Test func linksToGitLabCommitsAndComparisons() throws {
        let repository = try #require(URL(string: "https://gitlab.com/g/sub/r"))
        #expect(RemoteWebURL.commit("abcd", in: repository).absoluteString == "https://gitlab.com/g/sub/r/-/commit/abcd")
        #expect(
            RemoteWebURL.compare(from: "abcd", to: "ef01", in: repository).absoluteString
                == "https://gitlab.com/g/sub/r/-/compare/abcd...ef01")
    }

    @Test(arguments: [
        ["github.com", "GitHub"], ["gitlab.com", "GitLab"], ["bitbucket.org", "Bitbucket"],
        ["git.example.com", "git.example.com"],
    ])
    func namesRecognizedHostsOrReturnsTheHostname(_ pair: [String]) throws {
        let repository = try #require(URL(string: "https://\(pair[0])/o/r"))
        #expect(RemoteWebURL.hostName(of: repository) == pair[1])
    }

    @Test func usesOriginOrTheOnlyRemote() async throws {
        let temp = try TempDirectory()
        defer { temp.remove() }
        let inspector = GitInspector(runner: realRunner)
        let upstream = "git@gitlab.com:g/sub/r.git"
        let origin = "https://github.com/o/r.git"

        #expect(await inspector.remoteURL(temp.url) == nil)
        try await git(temp.url, ["init"])
        #expect(await inspector.remoteURL(temp.url) == nil)
        try await git(temp.url, ["remote", "add", "upstream", upstream])
        #expect(await inspector.remoteURL(temp.url) == upstream)
        try await git(temp.url, ["remote", "add", "backup", "https://bitbucket.org/o/r.git"])
        #expect(await inspector.remoteURL(temp.url) == nil)
        try await git(temp.url, ["remote", "add", "origin", origin])
        #expect(await inspector.remoteURL(temp.url) == origin)
    }
}
