# Kit Manager (macOS)

A native macOS app for managing projects generated from the Nuxt Starter Kit: see which kit version each project is on, review upgrade and migration state, and hand work off to Terminal, VS Code or Claude.

The app **reads, the CLI acts**. Anything that changes a project (upgrade, migration, module changes) is performed by `create-nuxt-saas`; the app only inspects state and launches the CLI after an explicit click.

## Requirements

- macOS 26 or later
- Xcode 27 or later
- Node 22 or later and pnpm
- The built CLI: run `pnpm --filter create-nuxt-saas build` from the repository root

## Layout

- `KitManager.xcodeproj` and `KitManager/`: the thin SwiftUI app target.
- `KitManagerCore/`: a local Swift package holding all testable logic (process layer, CLI client, project inspection, kit git history, launching).

Files added under `KitManager/` join the app target automatically.

## Open, build, run

```sh
open packages/kit-manager-macos/KitManager.xcodeproj
```

Pick the `KitManager` scheme and press Run, or build from the terminal:

```sh
xcodebuild -project packages/kit-manager-macos/KitManager.xcodeproj -scheme KitManager -configuration Debug build
```

The app is signed ad hoc and is not sandboxed, because it launches `node`, `git` and `claude` from your shell environment.

## Tests

```sh
swift test --package-path packages/kit-manager-macos/KitManagerCore
```
