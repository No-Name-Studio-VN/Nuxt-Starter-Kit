import KitManagerCore
import SwiftUI

/// A kit change's kind (new, fix or other) as a coloured symbol; the word is spoken and shown on hover.
struct CommitKindIcon: View {
    let commit: KitCommit

    var body: some View {
        Image(systemName: commit.kindSymbol)
            .font(.callout)
            .imageScale(commit.kindIsMinor ? .small : .medium)
            .foregroundStyle(commit.kindColor)
            .frame(width: 18)
            .help(commit.kindWord)
            .accessibilityLabel(commit.kindWord)
    }
}
