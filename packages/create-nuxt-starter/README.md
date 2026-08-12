# create-nuxt-starter

Create Nuxt projects from selected starter-kit modules, then pull upstream changes back in — including
into files you have edited.

```bash
npx @no-name-studio/create-nuxt-starter@latest init my-app
```

## Commands

- `init [--dir <path>] [--modules a,b] [--yes]` — generate a project from selected modules.
  Dependencies come along automatically, so `--modules admin-users` also installs what it needs.
- `upgrade [--check] [--force]` — move the project to the registry's kit revision (see below).
- `status` — installed modules, files you have modified, damaged markers, and whether an update exists.
  Reads only local state, so it is instant and works offline.
- `diff [--file <path>]` — unified diff of your files against the current upstream version.
- `modules` — list the modules in the registry.

Common flags: `--registry <path>` to use an alternative registry, and `--kit <path>` to work from a local
kit checkout instead of downloading one (`upgrade` also takes `--base-kit` for the revision you are
coming from).

## Upgrades

Generated projects carry `.nuxt-starter/manifest.json`, recording the modules installed, the kit revision
they came from, and a hash per file. Do not delete it — upgrades depend on it.

`upgrade` renders the old revision and the new one, then decides per file:

| Situation                 | What happens                                     |
| ------------------------- | ------------------------------------------------ |
| Unchanged upstream        | Skipped                                          |
| You never edited it       | Overwritten with the new version                 |
| Both changed, no overlap  | Merged automatically                             |
| Both changed, overlapping | Standard `<<<<<<<` conflict markers, reported    |
| New upstream file         | Added                                            |
| Removed upstream          | Deleted if untouched, otherwise kept and flagged |

`package.json` and `wrangler.jsonc` are never text-merged: each module's declared entries are compared
old-versus-new and applied only where you have not changed that value yourself.

A clean git working tree is required before applying (`--force` overrides), because git is the undo
mechanism: review with `git diff`, revert with `git restore`. `--check` previews without writing and
works on a dirty tree. Never touched: `.env*`, `content/`, database migrations, and lockfiles.

## Authoring markers

Shared kit files delimit module fragments with markers, in whatever comment syntax the file uses:

```ts
// <nsk:content>
content: {},
// </nsk:content>
```

```html
<!-- <nsk:pwa> -->
<meta name="theme-color" content="#000000" />
<!-- </nsk:pwa> -->
```

Every block needs a matching close, blocks cannot nest, and each belongs to exactly one module.
Generating a project deletes the blocks of modules you did not select and keeps the rest untouched,
markers included.

## Development

```bash
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit, strict
npm run build     # unbuild -> dist/
```

Tests run against miniature fixture kits in `test/fixtures/` (`kit-v1` and `kit-v2`), so nothing is
downloaded and upgrade behaviour is verified against two real revisions.

## Roadmap

`add` and `remove` for individual modules, and splitting the real kit into `base`, `pwa`, `content`,
`database`, `auth`, and `admin-users`, are specified in
`docs/superpowers/specs/2026-08-12-modular-cli-design.md` and land in the next plan. The registry
currently ships a single `full-starter` module until that split happens.
