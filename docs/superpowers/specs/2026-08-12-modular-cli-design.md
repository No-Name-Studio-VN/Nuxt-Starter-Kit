# Modular CLI for the Nuxt Starter Kit — Design

Date: 2026-08-12
Status: Approved pending user review
Package: `packages/create-nuxt-starter` (evolves the existing V1 code)

## Problem

The starter kit is one integrated app. Creating a project from it means cloning everything; keeping a created project up to date means manually copying upstream changes by hand. The goal is a shadcn-style CLI where:

1. `init` lets the user pick modules; modules can depend on each other and be installed independently later.
2. Installed code is fully owned by the user — they may edit any file.
3. **Upgrades are first-class**: the CLI pulls upstream changes into an existing project, including files the user has edited, replacing today's manual copying.

There are no existing generated projects to migrate; this design has no backward-compatibility constraints.

## Chosen architecture

The kit repo stays one integrated app (the development and testing environment). Modularity is layered on top:

- **Module manifests** in a registry declare which kit paths each module owns.
- **Marker blocks** in the kit's own source delimit module-owned fragments inside shared files.
- **Generated projects carry a manifest** recording what was installed from which pinned kit git revision.
- **Upgrades are three-way merges**: old pinned revision (base) vs. user's file (ours) vs. new revision (theirs).

Rejected alternatives: refactoring the kit into standalone module template directories (large refactor, worse day-to-day DX; revisit per-module if hidden coupling keeps biting), and Nuxt Layers/npm packages (upgrades trivial but contradicts full user ownership of code).

## Module graph (initial release)

`base` is always installed and contains **no server code and no PWA code** — a client-only site is a valid output. Arrows mean "requires":

```
base  (Nuxt 4, tailwind, UI foundation, layouts, nuxt.config scaffold)
 ├── pwa            (@vite-pwa/nuxt, service worker, InstallPrompter, pwa-assets config)
 ├── content        (@nuxt/content, content.config.ts, docs/blog pages)
 └── database       (drizzle, D1/libsql, server/db, db scripts)
      └── auth      (nuxt-auth-utils, OAuth/passkeys, sessions, user schema, middleware)
           └── admin-users  (AdminUsersManager, DataTable, admin API routes)
```

`content` deliberately does **not** require `database`: Nuxt Content v3 manages its own database (built-in local SQLite by default; D1/libsql/postgres adapters for serverless — per official docs). What `content` and `database` share on Cloudflare is infrastructure (the D1 binding), handled by reference-counted fragments (below). The content module's nuxt.config block ships the D1 adapter config as the kit uses it; switching adapters is user-owned config.

Everything else in the kit (i18n, theming, search, Sentry, …) remains unextracted for now. The `full-starter` profile is defined as all modules **plus** a `kit-extras` pseudo-module holding that remainder; it is tracked in the manifest like any other module, so full-starter projects upgrade through the same engine rather than a separate code path.

## Registry (schema v2)

One registry release pins exactly one kit git revision. Bundled inside the npm CLI package; `--registry` flag for overrides. Each module entry:

```jsonc
{
  "id": "auth",
  "version": "1.0.0", // bumped when the module's files changed since last release
  "requires": ["database"],
  "conflicts": [],
  "paths": ["server/api/auth/**", "app/components/auth/**", "..."],
  "structured": {
    // fragments for JSON/JSONC files — never text-merged
    "package.json": { "dependencies": { "nuxt-auth-utils": "^0.5.29" }, "scripts": {/* … */} },
    "wrangler.jsonc": {/* e.g. D1 binding */},
  },
  "env": ["NUXT_SESSION_PASSWORD"],
  "notes": ["Configure OAuth provider secrets before deploying."],
}
```

## Marker blocks

Shared text files in the kit are annotated in place. The integrated kit always has all modules enabled; extraction deletes blocks of unpicked modules.

```ts
// <nsk:content>
content: { /* … */ },
// </nsk:content>
```

- Comment syntax adapts to file type: `//` (ts/js), `<!-- -->` (vue templates/html/md), `/* */` (css).
- Blocks are self-identifying; the extractor discovers them by scanning, the registry does not list them.
- One module per block; no nesting; every block has exactly one owning module. A fragment needed by two modules is assigned to the nearest common module in their `requires` chains — never duplicated, since duplicated config keys would collide.
- Generated projects keep the markers — that is what makes `add`/`remove` of fragments and `status` damage checks mechanical. The upgrade engine never consults markers (see engine).

## Reference-counted shared fragments

Multiple modules may declare the same structured fragment (both `database` and `content` declare the D1 binding; several modules declare `zod`). Install unions fragments; remove deletes a fragment only when no remaining installed module declares it. The project manifest records which modules declared what, so removal is exact. Reference counting applies to structured fragments only — marker blocks always have exactly one owner.

## Single-revision invariant

A project is always at exactly one kit revision. Mixed revisions (base from rev A, auth from rev B) would be combinations no CI run has ever tested, and would make the pristine render of a shared file ill-defined — so they are banned by construction:

- `init` and `upgrade` record one revision for the whole project.
- `add` refuses to install from a registry pinning a newer revision than the project's; it prompts to run `upgrade` first (upgrade, then add).
- `upgrade` always moves the entire project to the registry's revision. Module arguments and the summary filter and group the _reporting_ per module; they never leave part of the project behind.

## Project manifest

Written into every generated project (`.nuxt-starter/manifest.json`):

- CLI schema version and render-algorithm version.
- The single pinned kit revision the whole project is at (see single-revision invariant).
- Placeholder substitutions used at generation time (project name, …) so any historical render is exactly reproducible.
- Per installed module: `id`, `version`, structured fragments it contributed, a content hash per file **as originally rendered** (pristine, pre-user-edit), and any orphaned paths (files kept despite upstream deletion, ignored by later upgrades).

Hashes are a fast path ("unmodified → safe overwrite"). The authority for merges is re-rendering the old revision from git, so a stale or missing hash degrades performance, never correctness.

## CLI commands

- `init [dir]` — interactive module picker (clack multiselect; picking `admin-users` auto-selects `auth` + `database`), placeholder prompts, renders the tree from the pinned revision, writes the manifest, `git init` + initial commit, offers `npm install`.
- `add <module...>` — resolves dependencies, copies owned files, inserts marker fragments into shared files, applies structured fragments, updates the manifest. Marker insertion into a shared file is a contextual patch: the block's position and surrounding lines from the pristine render locate the insertion point in the user's file. If that context cannot be located (heavily rewritten file), print the fragment with instructions rather than guessing. Requires the project to be at the registry's kit revision (single-revision invariant); otherwise prompts to run `upgrade` first.
- `remove <module>` — refuses while dependents are installed; deletes owned files (prompts for user-modified ones), strips its marker blocks, removes structured fragments per reference counting.
- `upgrade [module...]` — moves the whole project to the registry's pinned revision (see engine below). `--check` previews; module arguments filter the preview/report, never the apply; default interactive.
- `diff <module> [--file <path>]` — upstream vs. local diff (kept from V1).
- `status` — installed modules/versions, user-modified files, damaged markers, available updates.

## Upgrade engine

Preconditions: project manifest present; clean git working tree (`--force` to override). Git is the sole undo mechanism — review with `git diff`, revert with `git restore`.

Fetch the project's current revision A (manifest) and the registry's revision B via giget with caching; render both **with the project's full module set and stored placeholders** → pristine _base_ tree and pristine _target_ tree. The single-revision invariant makes both renders well-defined, and shared files need no special merge path: block interiors and the skeleton around them merge uniformly as part of the whole file. Then per file:

| Situation                                       | Action                                                        |
| ----------------------------------------------- | ------------------------------------------------------------- |
| Upstream unchanged                              | Skip                                                          |
| User never edited (content matches base render) | Overwrite with new version                                    |
| Both changed, non-overlapping                   | Three-way merge (diff3), applied silently                     |
| Both changed, overlapping                       | Write git-style conflict markers, report                      |
| New upstream file                               | Add; if an untracked file occupies the path, leave it, report |
| Deleted upstream                                | Delete if user never edited it; otherwise keep, report        |

- **Shared files** merge as whole files like any other — the base and target renders already contain exactly the installed modules' blocks, so markers are not consulted during merge. A block the user deleted or moved is simply a user edit and merges (or conflicts) accordingly.
- **JSON/JSONC files** (package.json, wrangler.jsonc) are never text-merged: the module's old vs. new structured declarations are diffed and applied, unless the user changed that same entry (reported instead).
- **Render determinism**: three-way merge is only sound if today's CLI reproduces byte-for-byte what an older CLI rendered from revision A. Rendering is therefore restricted to verbatim copy + marker-block deletion + literal token substitution (`{{PROJECT_NAME}}`-style); the manifest records a render-algorithm version and `upgrade` warns when it differs. No fuzzy rewriting — V1's sanitization pass does not carry over.
- Conflict markers use the standard `<<<<<<<`/`>>>>>>>` format so editor merge tooling works natively.
- Afterwards: manifest records the new revision and fresh pristine hashes; summary lists overwritten / auto-merged / conflicts / skipped.

## Safety rules

- Applying changes (`add`, `remove`, `upgrade`'s apply phase) requires a clean git tree (`--force` override). `upgrade --check`, `diff`, and `status` are read-only and work on dirty trees.
- All writes stage to a temp directory; files copy into the project only after the full plan validates.
- Never touched by `upgrade` or `remove`: `.env*`, files under `content/` (sample documents are written once by `init`/`add`, then belong to the user), database migration files (projects regenerate via `db:generate`), lockfiles.
- Required env vars declared by modules are printed in the post-install notes; the CLI never writes `.env*` files.
- Path traversal guards (`resolveInside`) retained from V1.

## Testing

1. **Unit** (existing `node --test` setup): diff3 merge cases (clean, conflict, delete), marker parser (all comment syntaxes, damaged markers, unknown IDs), extraction slicing, reference-counted structured fragments.
2. **Generation matrix in CI**: generate `{base}`, `{base,pwa}`, `{base,content}`, `{base,database,auth}`, and all-modules projects; run `nuxt typecheck` + build on each. This is the guard against undeclared coupling — the main risk of keeping the kit integrated — and runs on kit PRs.
3. **Registry↔kit consistency check in CI**: the union of every module's declared package.json entries must equal the kit's real package.json (minus a kit-tooling allowlist). The build matrix catches _missing_ declarations; this catches _stale_ ones.
4. **Upgrade fixtures**: a miniature fixture kit with two committed revisions (not real starter-kit history — fast and hermetic); generate at rev 1, apply scripted "user edits", upgrade to rev 2; assert exact per-file classification.

## Distribution

CLI on npm (`@no-name-studio/create-nuxt-starter`) with the registry bundled. A release = bump changed module versions, pin the new kit revision, publish. Users get updates via `npx @no-name-studio/create-nuxt-starter@latest`.

## Non-goals (this version)

- No migration of projects generated by the V1 CLI (none exist).
- No remote or third-party registries.
- No rename detection in upgrades (renames appear as delete + add).
- No partial upgrades: the project always moves to the new kit revision as a whole (reported per module); individual modules cannot be held back at an older revision.
- No automatic conflict resolution beyond diff3.
- No extraction of remaining kit features (i18n, theming, search, Sentry) — they stay in `full-starter`.

## Open items deferred to implementation planning

- Exact file-to-module path assignment (which kit paths each module owns) — determined during extraction work, validated by the CI matrix.
- Exact placeholder set for `init` prompts.
- Marker annotation pass over the kit's shared files (`nuxt.config.ts`, `content.config.ts`, `app.config.ts`, global css, …).
- Ownership of deployment files (`wrangler.jsonc`, nitro preset) for client-only projects that install no server modules.
