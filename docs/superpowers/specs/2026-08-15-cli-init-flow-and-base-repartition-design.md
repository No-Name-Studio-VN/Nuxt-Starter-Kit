# `init` flow and `base` re-partition — Design

Date: 2026-08-15
Status: Approved
Package: `packages/create-nuxt-saas`

## Problem

Two defects in the shipped CLI, one cosmetic and one structural.

**`init` cannot create a directory.** `dir` is a positional defaulting to `'.'`, so `npm create nuxt-saas@latest` with no argument targets the current working directory, and `assertEmptyTarget` rejects it as "not empty". The user is forced to create and enter a directory by hand first. Every comparable scaffolder — `create-next-app`, `create-vite`, `create-react-app` — instead prompts for a project name and creates a folder of that name. The project-name prompt already exists here but runs _after_ the module picker and feeds only `package.json`.

**`base` is not the frontend foundation it claims to be.** It declares `server/api/*`, `server/api/auth/**`, `server/api/users/**`, `server/api/admin/*`, `server/api/admin/kv/**`, `server/db/**`, `server/utils/**`, `server/middleware/**`, `server/tasks/**` and `shared/**`, plus drizzle, better-sqlite3, bcryptjs, nuxt-auth-utils and otpauth in its `structured` package.json block. Selecting `base` alone therefore generates a project carrying the entire database and authentication backend. The user asked for a frontend-only base and got a full-stack SaaS.

## Relationship to the 2026-08-12 design

This is not a new architecture. `docs/superpowers/specs/2026-08-12-modular-cli-design.md` already specified it:

> `base` is always installed and contains **no server code and no PWA code** — a client-only site is a valid output.

with a module graph of `base → database → auth → admin-users`. That document's final section deferred "exact file-to-module path assignment (which kit paths each module owns) — determined during extraction work, validated by the CI matrix". The extraction work assigned nearly everything to `base`, and the CI matrix could not catch it: a matrix row proves a combination _builds_, never that it is _minimal_. This spec restores the invariant and adds the check that would have caught the drift.

## Part 1 — `init` directory and name flow

The `dir` positional becomes genuinely optional (default drops from `'.'` to `undefined`), and name resolution moves ahead of the module picker so the name can determine the directory.

| Invocation                               | Target directory | Project name                       | Name prompt |
| ---------------------------------------- | ---------------- | ---------------------------------- | ----------- |
| `npm create nuxt-saas@latest`            | `./<name>`       | from prompt, default `my-nuxt-app` | yes         |
| `npm create nuxt-saas@latest my-app`     | `./my-app`       | `my-app`                           | no          |
| `npm create nuxt-saas@latest ./apps/web` | `./apps/web`     | `web`                              | no          |
| `npm create nuxt-saas@latest .`          | cwd              | basename of cwd                    | no          |
| `--yes`, no dir                          | `./my-nuxt-app`  | `my-nuxt-app`                      | no          |

Prompt order becomes: project name (when no directory was given) → description → modules. A cancel at the name step then costs nothing, and the module picker is the last thing before work begins.

**Name validation.** A new `validateProjectName` in `src/util/` — no existing helper covers this; `src/util/paths.ts` validates paths and `src/render/placeholders.ts` handles token substitution. It enforces the npm package-name rules that matter for a generated `package.json` (non-empty, ≤214 characters, lowercase, no leading `.` or `_`, URL-safe characters only) and additionally requires a single safe path segment, since the same string names a directory: no `/`, no `\`, no `.` or `..`, no characters Windows rejects. Validation runs inside the clack `text` prompt so a bad name is rejected in place, and again on the `--yes` path, before the kit is downloaded.

**Non-empty target.** Still refused — creating into a directory with existing files risks clobbering the user's work. The message improves from `<path> is not empty. Choose an empty directory.` to naming the conflicting entries (first few, then a count) so the user can see whether they are in the wrong directory or genuinely need a new name. A missing directory is still created by `mkdir(..., { recursive: true })`, which is what makes the new-folder case work with no further change to `runInit`.

**Next steps.** The outro gains the standard three lines — `cd <dir>`, `npm install`, `npm run dev` — with `cd` omitted when the target was the current directory. Existing module notes and required env vars continue to print after.

`--yes` with no directory changes meaning, from "scaffold into cwd" to "create `./my-nuxt-app`". This is a deliberate behaviour change; `cli-matrix.yml` always passes an explicit directory, so nothing in the repository depends on the old reading.

## Part 2 — module re-partition

### Registry schema

Two boolean flags are added to `moduleSchema`, both defaulting to `false`, so `base` stops being a special case the CLI hardcodes:

- **`required`** — the module is installed in every project. It is hidden from the picker, silently unioned into any explicit `--modules` list, and `remove` refuses it. Only `base` sets it.
- **`internal`** — the module is hidden from the picker and reachable only through another module's `requires`. It is plumbing with no meaning as a user-facing choice. Only `server-core` sets it.

`nuxt-saas modules` continues to list both, tagged, since that command is a registry inspection aid rather than a picker.

### Module graph

Arrows mean `requires`:

```
base (required)                 frontend only: app/, nuxt.config.ts, i18n,
 │                              theming, UI kit, landing + error pages,
 │                              repo tooling. No server/ directory.
 ├── content                    unchanged
 ├── pwa                        unchanged
 └── server-core (internal)     the API response envelope and both sides of it:
      │                         server/utils/apiResponse.ts, server tsconfig,
      │                         server error reporting, sentry server plugin,
      │                         types/api.ts, types/errors.ts, and the client
      │                         helpers typed against them — useAPI.ts,
      │                         useRequestState.ts, apiRequest.ts, apiError.ts
      └── database              drizzle + D1/libsql, server/db/**, migrations,
           │                    db:generate script, wrangler D1 binding
           └── auth             sessions, login/register/OAuth/password reset,
                │               lock screen, auth pages, auth middleware,
                │               dashboard shell, nuxt-auth-utils, bcryptjs
                ├── auth-2fa                  unchanged, re-parented
                ├── auth-passkeys             unchanged, re-parented
                ├── auth-email-verification   unchanged, re-parented
                └── admin       admin middleware (client + server), seed
                     │          endpoint and task, admin index page,
                     │          admin sidebar entries, types/admin.ts
                     ├── admin-users     moved out of base
                     ├── admin-kv        new module, extracted from base
                     └── feature-flags   moved out of base
```

`content` still does not require `database`, per the 2026-08-12 rationale: Nuxt Content v3 manages its own database.

`server-core` exists because every server module needs the same response envelope and server tsconfig, and nothing works without it — offering it as a choice would only produce a confusing failure when someone deselected it. `database` stays visible because "Drizzle and D1 without authentication" is a real project shape.

The client-side API helpers belong to `server-core` rather than `base` on the evidence of who uses them: every consumer of `parseApiError`, `apiRequest` and `useAPI` in the kit is an auth page, an admin panel, or the feature-flags composable — all of which leave `base`. `useRequestState.ts` has no consumers at all; it exists for the user's own code and is built on `parseApiError`, so it travels with it. `apiError.ts` parses the `success()` / `apiError` envelope that CLAUDE.md rule 11 mandates for server routes, and is meaningless in a project with no routes to parse. A frontend-only `base` therefore ships no fetch wrapper — the user writes their own, or adds a server module and gets the kit's.

`feature-flags` requires `admin` because it ships `app/pages/admin/feature-flags.vue`. Its public evaluation endpoint could in principle sit lower in the graph, but splitting one small module into two to express that is not worth the registry surface.

### What `base` keeps

`base` keeps the parts of `shared/` its own frontend imports — `constants/manifest.ts` (used by `app/layouts/default.vue`, `app/pages/index.vue`, `CenteredAppLayout.vue`, `useConfig.ts`), `utils/locales.ts`, and the generic `pagination.ts` / `url.ts` / `serialization.ts` / `commonEnums.ts` / `shuffleArray.ts` helpers. `shared/` is the client-and-server shared directory, not server code, so this does not violate the frontend-only rule. `shared/db.ts` leaves with `database`; `shared/schemas/userSchema.ts` and `userSecuritySchema.ts` and `constants/auth*.ts` leave with `auth`; `shared/schemas/adminKvSchema.ts` leaves with `admin-kv`.

`base` also keeps `wrangler.jsonc`, `nuxt.config.ts`, `docs.config.ts` and `.env.example` as files, with module-specific regions inside them delimited by markers.

### Marker work

Files that stay in `base` but contain regions belonging to modules need new `<nsk:…>` blocks. What the checks actually demanded:

| File                       | New blocks                                 | Why                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nuxt.config.ts`           | `auth`, `admin`, `database`, `server-core` | The `nuxt-auth-utils` and `@nuxtjs/turnstile` module entries, the session/turnstile/resend/seed `runtimeConfig` keys, the `hub` D1 and KV bindings, and the nitro tsconfig `include` of `auth.d.ts` |
| `wrangler.jsonc`           | `database`, `server-core`                  | The D1 and KV bindings                                                                                                                                                                              |
| `.env.example`             | `auth`, `admin`                            | Session, CSRF, Turnstile, Resend and OAuth secrets; admin password and seed secret                                                                                                                  |
| `shared/schemas/common.ts` | `auth`                                     | `totpCodeSchema` and its `TOTP_LENGTH` import — the rest of the file is generic validation base keeps                                                                                               |

Several files expected to need markers instead moved wholesale, which is simpler and was the right
answer once ownership was traced rather than assumed: `app/constants/sidebar.ts`, `AppSidebar.vue`,
`useSidebarContext.ts` and `HotSearch.vue` are reachable only from `app/layouts/dashboard.vue`, so the
whole dashboard shell belongs to `auth`. `shared/schemas/index.ts` is entirely lock-screen schemas over
a Drizzle table, so it belongs to `auth` too, and `shared/constants/totp.ts` went to `auth` rather than
`auth-2fa` because the lock screen uses it.

`shared/apiRoutes.ts` needs no markers. It holds route-name strings and `routeRules`, imports nothing
across a boundary, and is imported by `nuxt.config.ts` itself — so it stays whole in `base`. A
frontend-only project carries some route constants it has no routes for, which is dead text rather than
dead code, and marking every entry would add maintenance cost for no functional gain.

Each module's `env` and `notes` arrays move with its files. `base` currently declares seven environment variables, of which only `NUXT_PUBLIC_SITE_URL` is genuinely frontend; `NUXT_SESSION_PASSWORD` and `CSRF_SECRET` go to `auth`, `NUXT_DEFAULT_ADMIN_PASSWORD` and `NUXT_SEED_SECRET` to `admin`, and the two Resend variables to `auth` (password reset is what sends mail). Its wrangler and Sentry notes split the same way — the D1/KV binding note belongs to `database` and `admin-kv`, the manifest note stays in `base`.

### i18n

`i18n/locales/*.json` stays whole in `base`. JSON admits no comments, so `<nsk:…>` markers cannot delimit regions in it, and the alternative — routing translations through the registry's `structured` merge — would move large blocks of copy into `registry.json` for no functional gain. A frontend-only project carries some unused translation keys. They cost a few kilobytes and nothing else.

## No migration

The CLI is beta and breaking change is expected. `registry.json` moves to `0.4.0` and every module's `version` is bumped, but no code maps a pre-0.4.0 manifest onto the new module set.

The consequence is explicit and accepted: `planTransition` renders the _from_ endpoint using the old revision's own registry, so a project generated at 0.3.0 with `--modules base` will, on its next `upgrade`, find its server files owned by no installed module and plan them as deletions. Existing projects should re-generate rather than upgrade across this boundary. The release notes must say so.

## Verification

**Static import-ownership check** (new, `test/registry/importOwnership.test.ts`). For every kit file, extract explicit `import`/`export … from`/dynamic-`import()` specifiers, resolve the Nuxt aliases (`#shared/…` → `shared/…`, `~/…` and `~~/…`/`@@/…` → their roots), map both importer and target to their owning modules, and fail when a file imports across a module boundary its own module does not transitively `require`. This runs over every pair in seconds and is what makes the partition provable rather than plausible — it is the check whose absence let the original drift through.

An import's module is the marker block containing it where there is one, not the file's owner: those lines are deleted when the block's module is absent, so a `base` file may reach into `pwa` from inside an `<nsk:pwa>` block without coupling the two.

The same rule extends to npm packages, reduced to their installable name (`es-toolkit/compat` → `es-toolkit`). A module importing a package that only another module declares generates a project whose `package.json` is missing it. Only packages some module declares are checkable — one nobody declares is ambient, provided by Nuxt or arriving transitively, and `packageJsonCoverage` already holds declarations to the kit's real file.

Neither can see Nuxt auto-imports (`useUserSession()`, components referenced only as template tags). That gap is the matrix's job.

**Generation matrix** (`cli-matrix.yml`, existing). Rows are added so each new module is exercised alone on top of base: `database`, `auth`, `admin`, `admin-kv`, alongside the existing `content`, `pwa`, `admin-users`, `feature-flags`, the three auth sub-modules, and all-modules. Each row installs and typechecks the generated project, which resolves auto-imports and template component usage.

**Existing checks** continue to apply unchanged: `kitCoverage.test.ts` proves every kit file is owned or excluded and that no file is claimed twice; `packageJsonCoverage.test.ts` proves the union of module dependency declarations equals the kit's real `package.json`.

## Sequencing

Part 1 lands first as its own commit — it is independent of the re-partition and immediately fixes the flow users hit first. Part 2 then proceeds one extraction at a time, each keeping the full test suite and matrix green: `admin-kv` out of base, then `admin`, `auth`, `database`, and `server-core` last, since it is defined by what the others turned out to share.

## Non-goals

- No migration path for projects generated before 0.4.0.
- No stripping of unused i18n keys.
- No change to the upgrade engine, marker syntax, manifest format, or three-way merge.
- No further extraction of unmodularised kit features (theming, search, Sentry browser reporting) — they stay in `base`. Only Sentry's _server_ plugin moves, to `server-core`.
- No `--overwrite` or merge-into-non-empty-directory behaviour for `init`.

## Open items deferred to implementation

- The exact file-by-file ownership table. The coverage and import-ownership tests settle this mechanically, so it is recorded by `registry.json` itself rather than duplicated here.
- Which shared files need which marker blocks. The table above is a starting list, not a finding.
