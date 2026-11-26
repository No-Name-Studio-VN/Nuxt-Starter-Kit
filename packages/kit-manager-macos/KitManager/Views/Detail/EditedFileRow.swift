import AppKit
import KitManagerCore
import SwiftUI
import UniformTypeIdentifiers

/// One edited or deleted kit file. Both open a comparison; deleted files are struck through and badged.
struct EditedFileRow: View {
    let file: InspectFile
    /// The module that owns the file; nil for the base layer.
    let layerTitle: String?
    let layerColor: Color
    let onOpen: () -> Void

    @State private var isHovered = false

    private var isDeleted: Bool { file.status == .deleted }

    private var name: String {
        file.path.split(separator: "/").last.map(String.init) ?? file.path
    }

    /// The containing folder with a trailing slash, or empty at the project root.
    private var folder: String {
        guard let slash = file.path.lastIndex(of: "/") else { return "" }
        return String(file.path[...slash])
    }

    private var icon: NSImage {
        let ext = (name as NSString).pathExtension
        return NSWorkspace.shared.icon(for: UTType(filenameExtension: ext) ?? .data)
    }

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 10) {
                Image(nsImage: icon)
                    .resizable()
                    .frame(width: 18, height: 18)
                    .opacity(isDeleted ? 0.45 : 1)
                    .accessibilityHidden(true)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(name)
                        .font(.callout)
                        .strikethrough(isDeleted)
                        .foregroundStyle(isDeleted ? .secondary : .primary)
                        .lineLimit(1)
                        .layoutPriority(1)
                    if !folder.isEmpty {
                        Text(folder)
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                            .lineLimit(1)
                            .truncationMode(.head)
                    }
                }
                Spacer(minLength: 8)
                if let layerTitle {
                    HStack(spacing: 4) {
                        Circle().fill(layerColor).frame(width: 6, height: 6)
                        Text(layerTitle)
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .fixedSize()
                }
                if isDeleted {
                    ToneBadge(title: "Deleted", tone: .critical)
                }
                Image(systemName: "chevron.right")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .opacity(isHovered ? 1 : 0)
                    .frame(width: 16)
                    .accessibilityHidden(true)
            }
        }
        .buttonStyle(RowButtonStyle())
        .onHover { isHovered = $0 }
        .animation(.easeOut(duration: 0.12), value: isHovered)
        .help("View changes to \(file.path)")
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(isDeleted ? "Deleted" : "Edited"): \(file.path)")
        .accessibilityValue(layerTitle ?? "")
        .accessibilityHint("Compares this file with the installed kit")
        .accessibilityAddTraits(.isButton)
    }
}
