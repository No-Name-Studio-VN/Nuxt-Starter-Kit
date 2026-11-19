import Foundation

/// Whole-file patches from the kit checkout, and the paths included in the preview.
public struct KitDiff: Sendable, Equatable {
    public let text: String
    public let files: [String]
    public let isTruncated: Bool

    static func preview(of output: Data, maxBytes: Int) -> KitDiff {
        // `--raw -z --patch` emits NUL-delimited metadata, an extra NUL, then the patch.
        // The raw entries give us literal paths without decoding quoted patch headers.
        guard let separator = output.range(of: Data([0, 0])) else {
            return KitDiff(text: "", files: [], isTruncated: false)
        }
        let patch = output[separator.upperBound...]
        let limit = min(max(0, maxBytes), patch.count)
        let boundary = Data("\ndiff --git ".utf8)
        let raw = output[..<separator.lowerBound].split(separator: 0)
        var fields = raw.makeIterator()
        var files: [String] = []
        var fileEnd = patch.startIndex
        // Look only far enough to recognize a new file starting at the byte limit.
        let searchEnd = patch.startIndex + limit + min(patch.count - limit, boundary.count)
        while fileEnd < patch.endIndex, let header = fields.next(), let path = fields.next() {
            let status = header.split(separator: 32).last?.first
            let destination: Data
            if status == 82 || status == 67 { // R (rename), C (copy)
                guard let newPath = fields.next() else { break }
                destination = newPath
            } else {
                destination = path
            }
            var end = fileEnd
            // Git represents a type change (T) with a deletion and an addition in one raw entry.
            for _ in 0..<(status == 84 ? 2 : 1) {
                guard end < searchEnd else { break }
                end = patch.range(of: boundary, in: end..<searchEnd).map { $0.lowerBound + 1 } ?? patch.endIndex
            }
            guard end - patch.startIndex <= limit else { break }
            files.append(String(decoding: destination, as: UTF8.self))
            fileEnd = end
        }
        return KitDiff(
            text: String(decoding: patch[..<fileEnd], as: UTF8.self), files: files,
            isTruncated: fileEnd < patch.endIndex)
    }
}
