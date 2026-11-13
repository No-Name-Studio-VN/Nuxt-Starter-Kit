# create-nuxt-saas

Create a Nuxt project with only the modules you select, then add, remove or upgrade them later.
Requires Node.js 22 or newer, git and pnpm. The kit pins its pnpm version in `package.json`.

```bash
npm create nuxt-saas@latest my-app
cd my-app
pnpm install
pnpm dev
```

Without a directory, interactive init asks for a project name. On a terminal it also offers a module
picker. Follow the printed next steps to configure `.env` and, if you selected a database module,
run `pnpm db:generate` before starting the app. Dependencies are not installed by the CLI.

## Commands

Use `pnpm dlx create-nuxt-saas@latest` inside an existing project:

```bash
pnpm dlx create-nuxt-saas@latest add auth
pnpm dlx create-nuxt-saas@latest upgrade --check
pnpm dlx create-nuxt-saas@latest upgrade
```

The executable is `nuxt-saas`. These are its commands and flags:

```text
init [dir] [--yes] [--modules a,b] [--kit path] [--allow-dirty-kit]
           [--template github:owner/repo#ref] [--no-git]
add <modules> [--dir path] [--check] [--force] [--kit path] [--allow-dirty-kit]
remove <modules> [--dir path] [--check] [--force] [--kit path] [--allow-dirty-kit]
upgrade [--dir path] [--check] [--force] [--to ref] [--template github:owner/repo#ref]
        [--kit path] [--allow-dirty-kit]
modules [--dir path] [--template github:owner/repo#ref] [--kit path] [--allow-dirty-kit]
```

Put the subcommand **before its flags**: `upgrade --dir my-app --check`, not
`--dir my-app upgrade`. The first non-flag token selects a known subcommand; otherwise the arguments
go to init. Thus bare `nuxt-saas`, `nuxt-saas my-app` and `nuxt-saas init my-app` all initialize a
project. A misspelled command is treated as a directory name. `--help` / `-h` lists commands;
`upgrade --help` (or another subcommand) shows that command's flags.

### init

```bash
npm create nuxt-saas@latest my-app -- --yes --modules auth,pwa
npm create nuxt-saas@latest base-app -- --yes
```

- The target must be absent or empty. Its folder name becomes the package and worker name (sanitized
  for npm). With no directory, `--yes` / `-y` uses `my-nuxt-app`.
- `--modules` takes comma-separated IDs, trims whitespace and ignores empty entries. Required modules
  are added automatically: `auth` includes `database` and `server-core`. Base is always included; it
  is not a module ID to pass. `--yes` without `--modules`, or `--modules ''`, means **base only**.
- `--template` defaults to `github:No-Name-Studio-VN/Nuxt-Starter-Kit` (ref `main`). Refs resolve to
  full commit SHAs before rendering. `GITHUB_TOKEN` can authenticate GitHub requests.
- Init renders in a temporary sibling directory, then publishes the result into the target.
- By default it initializes git and attempts an initial commit. It skips this inside an existing
  repository; `--no-git` skips it explicitly. If the commit fails (for example, no git identity),
  `Git: initialised` means you still need to commit before using add/remove/upgrade.

### add and remove

```bash
pnpm dlx create-nuxt-saas@latest add auth-passkeys,pwa --check
pnpm dlx create-nuxt-saas@latest add auth-passkeys,pwa
pnpm dlx create-nuxt-saas@latest remove auth-passkeys
```

Both use the kit commit recorded in the project, not the latest kit. Adding brings the dependency
closure along. Removing is refused if a remaining module requires an ID being removed. Dependencies
are not automatically removed with their dependents: remove those explicitly if no longer needed.
Removing every layer is allowed; base remains.

`--dir` selects the project (default `.`). Applying requires a clean git tree; `--force` permits a
dirty tree or a project without git, but does not bypass conflicts or dependency checks. `--check`
previews the file plan without writing, even on a dirty tree.

### upgrade

```bash
pnpm dlx create-nuxt-saas@latest upgrade --check
pnpm dlx create-nuxt-saas@latest upgrade --to main
pnpm dlx create-nuxt-saas@latest upgrade --template github:owner/repo#release
```

Upgrade resolves the recorded template's ref (normally `main`), or `--to`, to a commit. `--template`
changes the target template; the old render still comes from the recorded source. Installed module
IDs must exist in the target kit. Newly required dependencies are included automatically.
`--dir`, `--check` and `--force` work as for add/remove.

### modules

Lists each module's ID, title and description, tagging installed and internal modules. Inside a
project it uses the recorded kit commit. Outside one it uses the default template's `main`, or
`--template`. `--dir` chooses where to look for project state.

### Local kit development

```bash
pnpm dlx create-nuxt-saas@latest init demo --yes --modules auth --kit /path/to/kit
pnpm dlx create-nuxt-saas@latest upgrade --dir demo --kit /path/to/kit --to HEAD
```

`--kit` uses a local git checkout and records its HEAD SHA, not its filesystem path. Dirty kits are
refused unless `--allow-dirty-kit` is passed. **Even with that flag, rendering uses `git archive` at
the resolved commit, not uncommitted edits or untracked files.** Commit kit changes to test them.
For add/remove it archives the project's recorded SHA; upgrade can resolve a local ref with `--to`.
If a recorded commit has not been pushed, supply a local checkout containing it on later commands too.
`--allow-dirty-kit` concerns the kit; `--force` concerns the generated project's working tree.

## State, merges and conflicts

Keep `.nuxt-saas.json` in version control. It records `version: 3`, the GitHub kit template, a full
40-character `commit`, the selected `modules` (including dependencies), project `identity` (name and
description), and `conflicts`. Base is implicit. There are no per-file hashes.

Add/remove/upgrade render the old and target projects in memory and compare them with your files.
`package.json`, `.env.example` and `wrangler.jsonc` use the same three-way text merge as other text
files; there is no separate JSON merge. The plan includes changes to all three.

| Situation                          | Result                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------- |
| Unchanged upstream                 | Skipped                                                                 |
| Your file equals the old render    | Updated or deleted to match the target                                  |
| Both edited, no overlap            | Merged with `git merge-file`                                            |
| Overlapping text edits             | Conflict markers written and path recorded                              |
| New upstream file                  | Created; a different existing text file is merged against an empty base |
| Upstream deleted a file you edited | Kept and reported as `keep-edited`                                      |
| You deleted an existing file       | Kept deleted and reported when upstream changes it                      |
| Binary file changed on both sides  | Kept and reported as `keep-edited`                                      |

Symbols in the report are `+` create, `~` update, `M` merge, `!` conflict, `-` delete and `=` keep.
Review the plan and use git to review or undo applied changes. The CLI does not commit transitions.

On conflicts, the recorded modules and commit **advance to the target**, and the command exits **1**.
Resolve the `<<<<<<< yours`, `||||||| kit (old)`, `=======` and `>>>>>>> kit (new)` blocks in each
listed file, then commit your resolution. The next add/remove/upgrade refuses while a listed file
still contains an opening conflict marker. Once resolved, the next applied transition writes the
cleared conflict list; `--check` never changes state. There is no separate continue command.

Protected paths are never overwritten, merged or deleted by a transition:

- `.env` and `.env.*`, except `.env.example`;
- `server/db/migrations/**`;
- root lockfiles: `pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `bun.lockb`;
- `content/**`.

A protected file is created only when the **old render did not contain it** and the new render
introduces it (init, adding a module or a newly introduced upstream file). If you deleted an existing
protected file, it stays deleted on upgrade, even if upstream changes it. The CLI manages its own
`.nuxt-saas.json` separately. It never writes through symlinks below the project root.

Follow-ups list `pnpm install` when the package changes, `pnpm db:generate` when a schema changes,
and new environment keys to fill. Kit migrations are never copied: generate migrations for your
selected schemas, and never hand-edit generated SQL or snapshots.

Exit codes: **0** success (including cancellation), **1** expected errors or merge conflicts
(including a preview that finds conflicts), **2** unexpected failures.

### Projects created with 2.x

3.0.0 is a clean break. A project with `.nuxt-saas/manifest.json` and no `.nuxt-saas.json` stops with:

> This project was created by create-nuxt-saas 2.x, which this version cannot manage. Generate a new project with `npm create nuxt-saas@latest` and move your code across.

There is no migration command. `status`, `diff`, `--registry` and `--base-kit` are removed; use
`upgrade --check` to preview changes.

## Modules are Nuxt layers

Base is the shared root app, including UI, theming, i18n, SEO, security and deployment infrastructure.
It has no auth or database feature code. It is always copied and has no `module.json`.
Each selected module is copied verbatim as `layers/<id>/`, which Nuxt 4 auto-registers. No fragments
are stripped from shared files. The root package, env example and worker config remain the full
kit's union; the CLI drops claims of unselected modules when rendering.

| Module                    | Requires      | Provides                                                   |
| ------------------------- | ------------- | ---------------------------------------------------------- |
| `server-core` (internal)  | —             | API envelope, error helpers, KV and cache bindings         |
| `database`                | `server-core` | D1/SQLite through NuxtHub and Drizzle; migration scripts   |
| `auth`                    | `database`    | Password/OAuth sessions, account pages and dashboard shell |
| `admin`                   | `auth`        | Admin guards, seed task and admin landing page             |
| `admin-users`             | `admin`       | User administration                                        |
| `admin-kv`                | `admin`       | Workers KV browser                                         |
| `feature-flags`           | `admin`       | OpenFeature flags, admin panel and edge evaluation         |
| `auth-2fa`                | `auth`        | TOTP setup and password-login challenge                    |
| `auth-passkeys`           | `auth`        | WebAuthn sign-in and passkey management                    |
| `auth-email-verification` | `auth`        | Verification email and password-login policy               |
| `content`                 | —             | Documentation, blog, search, RSS and Studio                |
| `pwa`                     | —             | Service worker, install prompt, offline page and assets    |

Internal modules are hidden from the picker, not from `modules`; they arrive through dependencies
and can also be requested explicitly. See each layer's README for its configuration.

## Authoring a module

### Folder and claims

Create `layers/<id>/module.json` and put the module's Nuxt config, app, server, schemas, types,
translations and assets under that folder. The folder name is the ID; do not add an `id` or version
field. For example, the existing passkeys layer claims:

```json
{
  "title": "Passkeys",
  "description": "WebAuthn sign-in and passkey management",
  "requires": ["auth"],
  "internal": false,
  "dependencies": ["@simplewebauthn/browser", "@simplewebauthn/server"],
  "devDependencies": [],
  "scripts": [],
  "env": [],
  "bindings": [],
  "rootFiles": []
}
```

`title` and `description` are required, nonempty strings. All arrays default to `[]`; `internal`
defaults to `false`. `requires` names other layer IDs, not base; unknown IDs and cycles are rejected.
The remaining arrays claim **names**, not values:

| Field                              | Names owned in the kit root                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `dependencies` / `devDependencies` | Package names in the corresponding `package.json` section                           |
| `scripts`                          | Whole script names in `package.json`                                                |
| `env`                              | Keys in `.env.example`                                                              |
| `bindings`                         | Binding names in top-level binding arrays in `wrangler.jsonc`                       |
| `rootFiles`                        | Root-relative globs for files required outside the layer; content uses `content/**` |

Versions and values live once, in the real root files. Claims must exist and cannot be shared
between modules. Put a shared dependency in an upstream module and require it. Unclaimed root
entries belong to base and ship everywhere. `kit.json` in this package controls copy exclusions,
including kit-only migrations, tests and release tooling.

### Imports and configuration

The root sets `experimental.localLayerAliases: false`. `~/` and `@/` refer to the base app,
`~~/` and `@@/` to the base root, and `#shared/` to base shared files — **never the current layer**.
Use relative imports or `#layers/<id>/…` for your own files. Cross-layer imports may only reach
IDs in your `requires` closure. Base never imports layers; upstream never imports downstream.

Put module-specific Nuxt modules, runtime config, route rules and security settings in the layer's
`nuxt.config.ts`. Resolve filesystem paths relative to that file (see `createResolver(import.meta.url)`
in the content/PWA layers), not the caller's working directory.

### UI extensions and navigation

Base's `app/utils/extensions.ts` exports `registerExtension(slot, { id, order, component })` and
`registerNavItem(menu, record)`. Register static contributions from a Nuxt plugin; lower `order`
values render first. IDs replace previous entries within the same slot/menu, so choose unique IDs.
Do not store per-user or per-request state in these shared registries.

```ts
import { defineAsyncComponent } from 'vue';

export default defineNuxtPlugin(() => {
  registerExtension('home:hero', {
    id: 'my-module-hero',
    order: 100,
    component: defineAsyncComponent(() => import('../components/Hero.vue')),
  });
  registerNavItem('header', {
    id: 'my-module-home',
    order: 100,
    labelKey: 'myModule.home',
    to: '/my-module',
  });
});
```

Base hosts `<ExtensionSlot name="…" />` for `app:root`, `home:hero` and `header:actions`, and the
`header` nav menu. Auth adds `auth:login:alternatives`, `auth:login:steps`, `sidebar:footer`,
`sidebar` and `userMenu`; admin adds `adminCards`. The auth login host selects a step by matching its
ID to `?step=`. Keep the host in the upstream layer and contributions in downstream plugins.

To add a typed slot/menu, augment `~~/types/extensions` in the owning layer's
`types/extensions.ts`. Make it a module (imports or `export {}`), and **import that file from the
registering plugin**, e.g. `import '#layers/auth/types/extensions'`. Without that import, the
augmentation is not visible. Define menu record types in the layer's `types/` directory. Follow
`layers/auth/types/extensions.ts` and `layers/admin/types/extensions.ts`.

### Server registries

Register from Nitro plugins with explicit imports from the owning layer:

- Auth `server/utils/loginPolicies.ts`: `registerLoginPolicy({ id, order, run })`. `run(ctx)` returns
  `{ kind: 'continue' }`, `{ kind: 'respond', body }` or `{ kind: 'deny', error }`. Policies run after
  valid password credentials, in ascending order, stopping on any non-continue outcome. Throws fail
  sign-in. Current order: email verification 100, account lock 150, two-factor 200. Verification and
  TOTP do not gate OAuth, One Tap or passkey sign-in.
- Auth `server/utils/postRegisterSteps.ts`: `registerPostRegisterStep({ id, order, run })`.
  Runs every step after password registration; `run(ctx)` returns `{ redirect?: string }`. If several
  steps return redirects, the last wins.
- Auth `server/utils/authTokenKinds.ts`: `registerAuthTokenKind({ id, expiresInMs })`. Token lifetimes
  must be positive and finite. Looking up an unregistered kind throws. See the email-verification
  plugin for registering a token kind alongside its policy and registration step.
- Admin `server/utils/seedTasks.ts`: `registerSeedTask({ id, order, key, label, run })`. Tasks run
  sequentially after admin creation; `run()` returns `Promise<Record<string, number>>`. `key` owns a
  seed-summary field, `label` prefixes logged counts. Duplicate IDs/keys and the reserved key `admin`
  are rejected. A thrown task stops the seed. See feature-flags' `seed-feature-flags.ts` plugin.

All server registries reject duplicate IDs. Keep types in `types/`, shared validation schemas in
`shared/schemas/`, and API handlers on the `success(...)` / `apiError(...)` response convention.
Call shared server functions rather than fetching the app's own API.

### Locales, database and CSS

- Add layer-owned strings in `i18n/locales/en.json` and `vi.json`, and declare their locale files in
  the layer config as content does. Base retains generic strings; absent modules must leave no strings.
- Put tables in the owning layer's `server/db/schema.sqlite.ts`. NuxtHub discovers layer schemas.
  Use **relative imports inside schema files**, including cross-layer table imports: NuxtHub's tsdown
  schema bundle does not resolve Nuxt aliases. Downstream tables can reference upstream tables;
  never add downstream relations to an upstream schema. Run `pnpm db:generate` after schema changes;
  never create or edit generated migration SQL/snapshots manually. Projects generate their own migrations.
- Base's `app/assets/css/tailwind.css` includes `@source '../../../layers';` so Tailwind scans layer
  templates. Keep it when adding layers and check compiled CSS, not just rendered HTML.

### Guards and CI

From the kit root:

```bash
pnpm --dir packages/create-nuxt-saas test
pnpm --dir packages/create-nuxt-saas run typecheck
pnpm typecheck
```

The boundary guard checks imports (including package ownership) against each layer's dependency
closure; the claims guard checks root names exist, are uniquely owned, and no package is in both
dependency sections. Fixture tests cover init/add/remove/upgrade equivalence, conflicts and protection.

Add a minimal combination for the new module to `.github/workflows/cli-matrix.yml`, as well as the
all-modules row. The matrix generates real projects, installs dependencies, typechecks, generates
migrations for database selections and checks for unselected layers and legacy scaffolding. This
catches auto-import and template coupling that static import guards cannot see.

## CLI development

From `packages/create-nuxt-saas`:

```bash
pnpm test
pnpm run typecheck
pnpm run build
```

The build bundles runtime dependencies into `dist/`; the published package contains `bin/`, `dist/`
and this README. See [RELEASING.md](./RELEASING.md) for the 3.0.0 release process.
