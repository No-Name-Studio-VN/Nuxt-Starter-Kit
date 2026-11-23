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
pnpm dlx create-nuxt-saas@latest upgrade --check
pnpm dlx create-nuxt-saas@latest upgrade
```

The executable is `nuxt-saas`. These are its commands and flags:

```text
init [dir] [--yes] [--modules a,b] [--kit path] [--allow-dirty-kit | --use-uncommitted-kit]
           [--to ref] [--template github:owner/repo#ref] [--no-git]
add <modules> [--dir path] [--check] [--force] [--no-backup] [--json] [--kit path] [--allow-dirty-kit]
remove <modules> [--dir path] [--check] [--force] [--no-backup] [--json] [--kit path] [--allow-dirty-kit]
upgrade [--dir path] [--check] [--force] [--no-backup] [--json] [--to ref] [--template github:owner/repo#ref]
        [--kit path] [--allow-dirty-kit | --use-uncommitted-kit]
undo [--dir path] [--yes | --check | --list] [--backup name] [--json]
resolve [file] [--keep-mine | --take-kit | --combine] [--decline] [--all] [--dir path] [--json]
decline <ids> [--revert] [--dir path] [--json]
notes --kit path [--check --since ref] [--allow-dirty-kit] [--json]
modules [--dir path] [--json] [--to ref] [--template github:owner/repo#ref] [--kit path]
        [--allow-dirty-kit]
inspect [--dir path] [--json] [--added] [--kit path] [--allow-dirty-kit]
```

Put the subcommand **before its flags**: `upgrade --dir my-app --check`, not
`--dir my-app upgrade`. The first non-flag token selects a known subcommand; otherwise the arguments
go to init. Thus bare `nuxt-saas`, `nuxt-saas my-app` and `nuxt-saas init my-app` all initialize a
project. A misspelled command is treated as a directory name. `--help` / `-h` lists commands;
`upgrade --help` (or another subcommand) shows that command's flags.

`--json` (on every command except `init`) prints exactly one JSON document on stdout instead of
the text report. Every document carries `"schema": 1`. Failures print
`{"schema":1,"error":{"message":"…","kind":"expected"|"unexpected"}}` instead of writing to stderr.
Exit codes: **0** success or cancelled, **1** expected error, **2** unexpected error,
**3** finished with conflicts needing a decision (including previews and `resolve` listings).

### init

```bash
npm create nuxt-saas@latest my-app -- --yes --modules auth-password,pwa
npm create nuxt-saas@latest base-app -- --yes
```

- The target must be absent or empty. Its folder name becomes the package and worker name (sanitized
  for npm). With no directory, `--yes` / `-y` uses `my-nuxt-app`.
- `--modules` takes comma-separated IDs, trims whitespace and ignores empty entries. Required modules
  are added automatically. For example, `auth-password` brings in `auth`, `database`, `server-core`,
  and `email`. Selecting `auth` without a sign-in method is refused. Base is always included and has
  no module ID. `--yes` without `--modules`, or `--modules ''`, means **base only**.
- `--template` defaults to `github:No-Name-Studio-VN/Nuxt-Starter-Kit` (ref `main`). Refs resolve to
  full commit SHAs before rendering. `GITHUB_TOKEN` can authenticate GitHub requests.
- Init renders in a temporary sibling directory, then publishes the result into the target.
- By default it initializes git and attempts an initial commit. It skips this inside an existing
  repository; `--no-git` skips it explicitly. If the commit fails (for example, no git identity),
  `Git: initialised` means no initial commit was made. Backups still work, but make an initial
  commit if you want Git to distinguish your edits from the generated files.

### add and remove

For example, in a base project:

```bash
pnpm dlx create-nuxt-saas@latest add auth-oauth,auth-passkeys,pwa --check
pnpm dlx create-nuxt-saas@latest add auth-oauth,auth-passkeys,pwa
# Commit the add changes before running remove.
pnpm dlx create-nuxt-saas@latest remove auth-passkeys
```

Both use the kit commit recorded in the project, not the latest kit. Adding installs required
modules. Removing is refused if a remaining module still requires one of the removed IDs, or if the
remaining selection breaks a `requiresOneOf` rule. Remove public dependencies explicitly if you no
longer need them. The CLI removes internal dependencies that no remaining module needs. You can
remove every layer and keep only base.

`--dir` selects the project (default `.`). `--check` previews the plan and assesses unsaved work
without changing the project. A dirty tree does **not** need `--force` if its unsaved changes will
be merged cleanly or left alone. If the transition would produce conflicts or keep edited files,
the CLI asks whether to continue, preview, or cancel. In scripts (including `--json`), pass `--force`
to proceed over at-risk changes.

The CLI makes a local backup by default without moving your branch or staging files. Use
`--no-backup` to skip it. Outside Git, writes require both `--force` and `--no-backup`.
Neither flag bypasses unresolved conflicts from a previous transition or dependency checks.

### upgrade

```bash
pnpm dlx create-nuxt-saas@latest upgrade --check
pnpm dlx create-nuxt-saas@latest upgrade --to main
pnpm dlx create-nuxt-saas@latest upgrade --template github:owner/repo#release
```

Upgrade resolves the recorded template's ref (normally `main`), or `--to`, to a commit. `--template`
changes the target template; the old render still comes from the recorded source. Installed module
IDs must exist in the target kit. Newly required dependencies are included automatically.
The CLI refuses upgrades between different major kit versions. See
[Moving a 3.x project to 4.0](#moving-a-3x-project-to-40). `add` and `remove` continue to work at the
project's recorded commit.
`--dir`, `--check`, `--force` and `--no-backup` work as for add/remove.

### undo

```bash
pnpm dlx create-nuxt-saas@latest undo --list
pnpm dlx create-nuxt-saas@latest undo --check --json
pnpm dlx create-nuxt-saas@latest undo --yes
```

Undo restores the most recent upgrade, addition or removal and preserves the work that was on
disk before it, including staged files. Choose another backup with `--backup <name>`. Use
`--check` to see whether undo is safe without restoring anything. Undo refuses if HEAD moved to
another commit, staged entries changed, or files match neither their state before nor after the
transition. If a restore stops midway, fix the error and run undo again; it skips files already
restored. Use `--yes` to restore without a prompt, or in non-interactive/JSON mode. `--list` shows
active and restored backups for this worktree, which are kept for 14 days.

### resolve

```bash
nuxt-saas resolve
nuxt-saas resolve --all
nuxt-saas resolve --json
nuxt-saas resolve app/pages/index.vue --take-kit
```

Run `resolve` in a terminal to walk through pending conflicts. `--all` also walks through kept files
that you haven't acknowledged. For a conflict, `--keep-mine` or `--take-kit` selects that side of
each conflicting hunk without replacing edits elsewhere in the file. `--combine` keeps the kit's
additions without bringing back lines you deleted. If you also added lines, it keeps yours first.
For a kept file, `--keep-mine` acknowledges it and
`--take-kit` replaces it with the saved kit copy, if available. `--decline` with `--keep-mine`
remembers the change note IDs for that file.

With `--json`, the CLI lists `decisions` without prompting. An explicit action also returns
`resolved: { path, action }`. Conflicts can still be resolved when the saved report is missing,
but suggestions and saved kit copies require the report. If nothing else changed after the
transition, `resolve` keeps its backup restorable by `undo`.

### decline

```bash
nuxt-saas decline auth.account-menu,base.new-home
nuxt-saas decline auth.account-menu --revert
```

Remember that you don't want the named changes in this project. Pass comma-separated note IDs.
`--revert` lets the CLI suggest those changes again. This doesn't modify feature files or disable
modules; it changes how future upgrades and `inspect` report those notes. JSON returns `declined`.

### notes

```bash
nuxt-saas notes --kit .
nuxt-saas notes --kit . --check --since v3.1.0
```

Lists change notes from the local kit's committed HEAD. `--check` lists changed kit files that aren't
covered by a note for the current kit version and exits 1 if any are uncovered. `--allow-dirty-kit`
permits a dirty checkout without including uncommitted changes. See [RELEASING.md](RELEASING.md) for
how to write notes and check release coverage.

### modules

Lists each module's ID, title, and description, tagging installed and internal modules. When the kit
declares groups, the CLI lists modules by group and indents each child under its parent. Inside a
project it uses the recorded kit commit. Outside one it uses the default template's `main`, or
`--template`. `--dir` chooses where to look for project state.

`--to <ref>` lists the modules at another kit ref or commit. It is only valid outside a project;
inside one the command throws, because the recorded commit decides. `--json` prints one document
with `schema`, the resolved `commit`, every module with its claims (`dependencies`,
`devDependencies`, `scripts`, `env`, `bindings`, `rootFiles`), its `group`, `parent`,
`requiresOneOf`, and `changes`, the kit's `groups` order, and the `installed` module IDs.

### inspect

Read-only. Renders the project's recorded modules at its recorded kit commit and compares every
rendered file with the working tree. It never writes. Each file is `unchanged`, `edited` (including
symbolic links and non-files), `deleted` or `protected` (protected paths such as `.env*`, lockfiles,
migrations and `content/` are not compared). It also reports the file's layer (`base`, a module ID,
or the module whose `rootFiles` claim it), whether the file is `expected` to differ, and the
recorded and unresolved conflicts (files still holding `<<<<<<<` markers).

The summary counts `total`, `unchanged`, `edited`, `deleted`, `protected` and `expected`.
`scored` counts rendered files that are neither protected nor expected. `scoredChanged` counts how
many of those are edited or deleted. The customisation score is `scoredChanged / scored`.

Use `inspect --added` to also list files outside the kit render. It requires a Git working tree and
includes tracked files still present and untracked files that Git does not ignore. It skips root
`.env*` files except `.env.example`, migrations, root lockfiles, and CLI state and reports. It also
skips files under `.nuxt`, `.output`, `node_modules`, and `.data`. Added files appear under `Added:` in the
text report. The summary includes them in `total` and counts them separately as `added`. They do not
change the customisation score.

`--json` prints the full report with `schema`, `commit`, `kit`, `modules`, `identity`, `conflicts`, `files` and
`summary`. With `--added`, new entries have the same `path`, `status`, `layer`, and `expected` fields.
Their `status` is `added` and their `expected` is `false`. The report also includes
`features: { missing, declined }`. A note is listed in `missing` when an edited or deleted file
in the recorded kit may be hiding that change and the note hasn't been declined. Exit code is 0
unless the command fails.

### Local kit development

```bash
pnpm dlx create-nuxt-saas@latest init demo --yes --modules auth-password --kit /path/to/kit
pnpm dlx create-nuxt-saas@latest upgrade --dir demo --kit /path/to/kit --to HEAD
```

`--kit` uses a local git checkout and records its HEAD SHA, not its filesystem path. Dirty kits are
refused unless `--allow-dirty-kit` is passed. **Even with that flag, rendering uses `git archive` at
the resolved commit, not uncommitted edits or untracked files.** To test the working tree instead,
use `--kit <path> --use-uncommitted-kit` with `init` or `upgrade`. It includes uncommitted and
untracked, non-ignored kit files, keeps the commit under `refs/nuxt-saas/kit-snapshots/` in the kit
repository, and leaves your index and branch alone. It cannot be combined with `--to`.
For add/remove the CLI archives the project's recorded SHA; upgrade can resolve a local ref with `--to`.
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

The terminal groups automatic changes, conflicts, kept versions, and new files. After applying,
`.nuxt-saas/upgrade-report.md` and `.nuxt-saas/upgrade-report.json` record the result. Target kit
versions for conflict and kept paths are saved under `.nuxt-saas/kit-versions/` when they exist.
Newly relevant change notes and suggested conflict actions appear in the terminal and saved reports
(`notes` and `suggestions` in JSON). These files are Git-ignored. Use `git diff` to review changes or
`nuxt-saas undo` to restore the backup.
The CLI does not commit transitions to your branch.

On conflicts, the recorded modules and commit **advance to the target**, and the command exits **3**.
Use `nuxt-saas resolve` or edit the `<<<<<<< yours`, `||||||| kit (old)`, `=======` and
`>>>>>>> kit (new)` blocks in each listed file, then commit your resolution. The next add/remove/upgrade refuses while a listed file
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

### Moving a 3.x project to 4.0

Kit 4.0 is a clean break. Generate a new project and move your code across instead of running `upgrade`.

1. Generate a 4.0 project with the equivalent modules. If the old project used `auth`, select
   `auth-password`, `auth-oauth`, or both, depending on how users sign in. Both bring in `auth`.
   Include `dashboard` if the app used the dashboard shell or admin area. Include `content-studio`
   if you used Nuxt Studio. The 4.0 auth layer uses `NUXT_APP_SECRET` in place of
   `NUXT_SESSION_PASSWORD`; see the generated `.env.example`.
2. From the old project, run `pnpm dlx create-nuxt-saas@latest inspect --added`. Use the `Added:` and
   `Edited:` lists to identify code to carry over. Copy `server/db/migrations/**` separately to keep
   the database's migration history. The inventory skips migrations.
3. If you use a database, install dependencies and run `pnpm db:generate` in the new project. Read the
   generated migration before applying it to a populated database. For a 3.x project with `auth`,
   the migration drops `users.password`. It also drops `oauth_accounts` if you omit `auth-oauth`.
   To keep existing passwords, install `auth-password` and plan and test a data migration that copies
   the hashes to `user_passwords.password_hash` before the generated migration drops `users.password`.

### Upgrading from 2.x

The current CLI cannot manage projects generated by 2.x. Generate a fresh project and move your
code across. A project with `.nuxt-saas/manifest.json` and no `.nuxt-saas.json` stops with:

> This project was created by create-nuxt-saas 2.x, which this version cannot manage. Generate a new project with `npm create nuxt-saas@latest` and move your code across.

When `--kit` points to a local checkout that lacks the commit recorded by your project, fetch the ref containing that commit (for a shallow clone, deepen it as needed) or point `--kit` at another clone that has it.

To keep challenge verification after upgrading an existing password project, add `bot-protection`. The Turnstile environment keys stay the same; `auth-password` no longer enables verification on its own.

There is no migration command. `status`, `diff`, `--registry` and `--base-kit` are removed; use
`upgrade --check` to preview changes.

## Modules are Nuxt layers

Base is the shared root app, including UI, theming, i18n, SEO, security and deployment infrastructure.
It has no auth or database feature code. It is always copied and has no `module.json`.
Each selected module is copied verbatim as `layers/<id>/`, which Nuxt 4 auto-registers. No fragments
are stripped from shared files. The root package, env example and worker config remain the full
kit's union; the CLI drops claims of unselected modules only when no selected module also claims them.

| Group          | Module                    | Parent          | Requires                              | Requires one of               | Provides                                                        |
| -------------- | ------------------------- | --------------- | ------------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| Foundation     | `database`                |                 | `server-core`                         |                               | D1/SQLite through NuxtHub and Drizzle, plus migration scripts   |
| Foundation     | `bot-protection`          |                 | `server-core`                         |                               | Optional bot verification for public forms and API routes       |
| Authentication | `auth`                    |                 | `server-core`, `database`             | `auth-password`, `auth-oauth` | Accounts, sessions, and the sign-in page                        |
| Authentication | `auth-oauth`              | `auth`          | `server-core`, `auth`                 |                               | OAuth sign-in with providers selected in `site.config.ts`       |
| Authentication | `auth-password`           | `auth`          | `server-core`, `auth`, `email`        |                               | Password sign-in, registration, and password reset              |
| Authentication | `auth-2fa`                | `auth-password` | `server-core`, `auth-password`        |                               | TOTP setup and password sign-in challenge                       |
| Authentication | `auth-email-verification` | `auth-password` | `server-core`, `auth-password`        |                               | Verification email and password sign-in policy                  |
| Authentication | `auth-passkeys`           | `auth`          | `server-core`, `auth`, `kv`           |                               | WebAuthn sign-in and passkey management                         |
| App            | `admin`                   |                 | `server-core`, `auth`, `dashboard`    |                               | Admin guards, seed task, and admin landing page                 |
| App            | `admin-kv`                | `admin`         | `server-core`, `admin`, `kv`, `cache` |                               | Workers KV browser                                              |
| App            | `admin-users`             | `admin`         | `server-core`, `admin`                |                               | User administration                                             |
| App            | `feature-flags`           | `admin`         | `server-core`, `admin`, `kv`, `cache` |                               | OpenFeature flags, admin panel, and edge evaluation             |
| App            | `dashboard`               |                 |                                       |                               | Dashboard layout, sidebar, and quick search                     |
| App            | `pwa`                     |                 |                                       |                               | Service worker, install prompt, offline page, and assets        |
| Content        | `content`                 |                 |                                       |                               | Documentation, blog, search, and RSS                            |
| Content        | `content-studio`          | `content`       | `content`                             |                               | Nuxt Studio and MDC component metadata                          |
| Internal       | `email`                   |                 |                                       |                               | Transactional email through Resend                              |
| Internal       | `server-core`             |                 |                                       |                               | API envelope, error helpers, request utilities, and rate limits |
| Internal       | `kv`                      |                 | `server-core`                         |                               | NuxtHub key-value storage and `useKV()`                         |
| Internal       | `cache`                   |                 | `server-core`                         |                               | NuxtHub-backed Nitro cache storage                              |

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
  "group": "Authentication",
  "parent": "auth-password",
  "requires": ["auth-password"],
  "requiresOneOf": [],
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
defaults to `false`. The CLI uses these fields to display modules and check selections:

- `group` names a heading from `groups` in `kit.json`. If the kit declares `groups`, every
  non-internal module must name one. The picker and `modules` list use the kit's group order.
  Older kit snapshots without `groups` display a flat list.
- `parent` is optional. The CLI displays the module under its parent. The parent must exist in
  the same group and appear in the module's `requires` list.
- `requires` names modules the CLI installs automatically, not base. Unknown module IDs and
  dependency cycles are errors.
- `requiresOneOf` names alternative modules. If you select a module with a nonempty
  `requiresOneOf`, the final selection must contain at least one of the listed IDs. The CLI
  rejects unknown IDs and never installs alternatives automatically. An alternative can
  require the declaring module without creating a cycle.

`modules --json` includes `group` and `parent` as strings or `null` and `requiresOneOf` as an
array. When you remove a module, the CLI also removes internal modules that no remaining
module needs through `requires`. The CLI keeps files you edited and reports them.

The remaining arrays claim **names**, not values:

| Field                              | Names owned in the kit root                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| `dependencies` / `devDependencies` | Package names in the corresponding `package.json` section                           |
| `scripts`                          | Whole script names in `package.json`                                                |
| `env`                              | Keys in `.env.example`                                                              |
| `bindings`                         | Binding names in top-level binding arrays in `wrangler.jsonc`                       |
| `rootFiles`                        | Root-relative globs for files required outside the layer; content uses `content/**` |

Versions and values live once, in the real root files. Named claims must exist and may be shared
between modules; a name is kept while any selected module claims it. `rootFiles` globs must remain
uniquely owned. Unclaimed root entries belong to base and ship everywhere. `kit.json` in this package controls copy exclusions,
including kit-only migrations, tests and release tooling. Its optional `userOwned` globs list the
files projects are expected to customise (`package.json`, `wrangler.jsonc`, `.env.example`,
`README.md`, `site.config.ts`, `i18n/**`, `public/**`). `inspect` flags them as `expected` and keeps
them out of the customisation score. When absent, for example in older kit commits, the same default
list applies.

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

Base hosts `<ExtensionSlot name="…" />` for `app:root`, `home:hero`, and `header:actions`, and owns the
`header` nav menu. `auth` hosts `auth:login:methods` and `auth:login:footer`. A matching `?step=` renders
an `auth:login:steps` entry instead of the sign-in methods. `auth` also owns the `userMenu` nav menu.

`auth-password` hosts `auth:login:alternatives` in the password form and `auth:register:methods` on
its registration page. The `auth` types declare both method slots so `auth-oauth` can register its
buttons without depending on `auth-password`. `dashboard` hosts `sidebar:user`, `sidebar:footer`,
and `dashboard:header:actions`, and owns the `sidebar` nav menu. `admin` owns `adminCards`.
Keep the host in the upstream layer and contributions in downstream plugins.

To add a typed slot/menu, augment `~~/types/extensions` in the owning layer's
`types/extensions.ts`. Make it a module (imports or `export {}`), and **import that file from the
registering plugin**, e.g. `import '#layers/auth/types/extensions'`. Without that import, the
augmentation is not visible. Define menu record types in the layer's `types/` directory. Follow
`layers/auth/types/extensions.ts`, `layers/auth-password/types/extensions.ts`,
`layers/dashboard/types/extensions.ts`, and `layers/admin/types/extensions.ts`.

### Server registries

Register from Nitro plugins with explicit imports from the owning layer:

- `layers/auth/server/utils/loginPolicies.ts`: `registerLoginPolicy({ id, order, methods, run })`.
  Policies run after identity is verified, before the session is written. Omit `methods` to run on all
  sign-in methods. Policies run in ascending order and stop at the first `{ kind: 'respond', respond }`
  or `{ kind: 'deny', error }` instead of `{ kind: 'continue' }`. A thrown policy fails sign-in.
  Email verification runs at order 100 and TOTP at 200, both for password sign-in only. Account lock
  runs at 150 for every method.
- `layers/auth/server/utils/signInMethods.ts`: `registerSignInMethod()` registers how to count a user's
  credentials for a sign-in method and, optionally, how to set a secret for that method.
- `layers/auth-password/server/utils/postRegisterSteps.ts`: `registerPostRegisterStep({ id, order, run })`.
  Every step runs after password registration. `run(ctx)` returns `{ redirect?: string }`. If several
  steps return redirects, the last wins.
- `layers/auth-password/server/utils/authTokenKinds.ts`: `registerAuthTokenKind({ id, expiresInMs })`.
  Token lifetimes must be positive and finite. Looking up an unregistered kind throws. The
  email-verification plugin registers a token kind alongside its policy and registration step.
- `layers/admin/server/utils/seedTasks.ts`: `registerSeedTask({ id, order, key, label, run })`. Tasks run
  in ascending order. `run()` returns `Promise<Record<string, number>>`. `key` owns a seed-summary
  field and must be unique. `label` prefixes logged counts. A thrown task stops the seed. See
  `layers/feature-flags/server/plugins/seed-feature-flags.ts`.

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
closure; the claims guard checks root names exist, root-file globs are uniquely owned, and no package
is in both dependency sections. Fixture tests cover init/add/remove/upgrade equivalence, conflicts
and protection.

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
