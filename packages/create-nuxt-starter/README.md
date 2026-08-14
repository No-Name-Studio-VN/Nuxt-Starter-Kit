# create-nuxt-starter

Create Nuxt projects from selected starter-kit modules, then pull upstream changes back in — including
into files you have edited.

```bash
npx @no-name-studio/create-nuxt-starter@latest init my-app
```

## Commands

- `init [--dir <path>] [--modules a,b] [--yes]` — generate a project from selected modules.
  Dependencies come along automatically, so `--modules admin-users` also installs what it needs.
- `add <modules>` — install more modules. Their files are written, their marker blocks are inserted
  into shared files, and their `package.json` entries are merged in. Requires the project to be on
  the registry's revision, so upgrade first if it has moved on.
- `remove <modules>` — uninstall modules: files deleted, marker blocks stripped, emptied directories
  pruned, `package.json` entries removed (entries another installed module still declares are kept).
  Refused if a surviving module requires what you are removing, or if the removal would leave the
  project with no modules at all. Files you have edited are kept and flagged as orphans. Like `add`,
  it needs the project to be on the registry's revision.
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

JSON files a module declares under `structured` are never text-merged: each declared entry is compared
old-versus-new and applied only where you have not changed that value yourself. Today that is
`package.json`. Everything else, `wrangler.jsonc` included, goes through the three-way text merge — so
the worker name and routes you set survive an upgrade unless the kit changed those same lines.

A clean git working tree is required before applying (`--force` overrides), because git is the undo
mechanism: review with `git diff`, revert with `git restore`. `--check` previews without writing and
works on a dirty tree. Never touched: your `.env` files, `content/`, database migrations, and
lockfiles. `.env.example` is upgraded like any other file — it is the kit's list of what a project
has to set, not a secret, so a module has to be able to add to it.

## Modules

| Module                    | Owns                                                                            |
| ------------------------- | ------------------------------------------------------------------------------- |
| `base`                    | Nuxt foundation, shadcn UI, theming, i18n, SEO, security, the public site shell  |
| `pwa`                     | Service worker, install prompt, offline page, `pwa-assets.config.ts`             |
| `content`                 | Nuxt Content, docs site, blog, MDC components, Studio                            |
| `admin-users`             | Admin screens and APIs for listing, editing, locking and deleting users          |
| `feature-flags`           | OpenFeature flags backed by KV, admin panel, edge evaluation endpoint            |
| `auth-2fa`                | TOTP second factor at sign-in, with setup, verification and disable endpoints    |
| `auth-passkeys`           | WebAuthn sign-in and passkey registration, listing and removal                   |
| `auth-email-verification` | Verification notice, confirmation link and resend endpoint for new accounts      |

Every module is optional and leaves nothing behind: no files, no imports, no dependencies, no dead
menu entries. A base-only project is 602 files against 818 with everything.

Core `auth` (sessions, password sign-in, OAuth) and `database` (NuxtHub D1, drizzle) are still part of
`base`. Peels run in reverse dependency order — `database` cannot become optional while `auth` still
requires it — so `auth` comes out first, and the four modules above gain a `requires: ["auth"]` edge
when it does.

### Adding a module: peel, do not shard

A new module takes files _out of_ an existing one rather than being built alongside it, one module per
commit, with `test/registry/` green at each step:

1. Move its paths out of the owner's `paths` into the new module. A pattern that names an existing
   file claims it out of any directory glob that also covers it, so `base` keeps `app/components/**`
   while `pwa` names `app/components/InstallPrompter.vue` — no enumeration of hundreds of files, and
   Nuxt's `[...slug].vue` route files are claimable at all.
2. Wrap its fragments of shared files in `<nsk:id>` markers, including now-conditional imports: an
   import left behind ships an unused symbol to every project without the module.
3. Declare its `package.json` entries in `structured`. The kit's own `package.json` is the union of
   every module, so entries are _subtracted_ when a module is left out — an entry no module declares
   can never be subtracted and would ship everywhere.
4. Add the combination to `.github/workflows/cli-matrix.yml`. Generating and compiling each
   combination is the guard against undeclared coupling: a `base` file importing the module's symbols
   compiles fine in the kit, where everything is present, and only fails once the module is left out.
   That is how the `feature-flags` tables were caught still sitting in `base`'s drizzle schema.

`test/registry/kitCoverage.test.ts` fails when a kit file belongs to no module and is not in the
registry's `exclude` list; `packageJsonCoverage.test.ts` holds the registry and the kit's real
`package.json` to each other in both directions.

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

All three mutating commands (`add`, `remove`, `upgrade`) share one planner: each is a transition
between two (revision, module set) pairs, three-way merged against your project. That is why adding a
module merges cleanly into config files you have edited.

## Roadmap

Core `auth` and `database` are still to be peeled out of `base`, in that order. The design
is in `docs/superpowers/specs/2026-08-12-modular-cli-design.md` and the plan in
`docs/superpowers/plans/2026-08-14-cli-kit-modularisation.md`.
