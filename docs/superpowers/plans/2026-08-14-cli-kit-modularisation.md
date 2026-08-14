# Modular CLI — Plan 4: Modularising the Real Kit (Plan 3, Phase B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn this repository — the kit itself — into the seven modules the registry advertises, so `nuxt-starter init --modules base,pwa` produces a project that contains only what those modules own and that actually typechecks and builds.

**Spec:** `docs/superpowers/specs/2026-08-12-modular-cli-design.md`
**Builds on:** Plans 1–3 (all complete). This is Plan 3's Phase B, unblocked now that the kit's config files are committed.

## What Phase B said, and three gaps found while reviewing it

Phase B was written as four bullets. Executing them as written does not work, for three reasons:

1. **`init` only adds structured entries; it never removes them.** The fixture kit's `package.json` is deliberately base-only, so every module's dependencies get merged in and the fixture passes. The real kit's `package.json` is this repo's own working file — it must list every dependency or the kit cannot build or run CI. Copied verbatim, `init --modules base` would ship a project depending on `@nuxt/content`, `drizzle-orm`, and everything else. The kit's `package.json` therefore has to be treated as the _union_ of all modules, with unselected modules' entries **subtracted** at render time. That subtraction is exactly what Phase B bullet 4's consistency check makes safe, which is a strong sign it was the intended design.

2. **`wrangler.jsonc` is JSONC, not JSON.** It has `//` comments and trailing commas, so `JSON.parse` throws. It cannot be a `structured` target. It can carry marker blocks instead — and because JSONC tolerates a trailing comma, deleting a whole array element inside a block leaves a valid document.

3. **Kit-only paths have nowhere to be declared.** `packages/create-nuxt-starter/**` (the CLI itself), `docs/superpowers/**`, `CLAUDE.MD`, and the husky/commitlint tooling must never render into a generated project. Unowned files already don't render, but a coverage check cannot tell "deliberately kit-only" from "someone forgot to assign this".

**Tech Stack:** Unchanged. Registry schema gains one optional field; no schema version bump (it defaults, so existing registries stay valid).

## Global Constraints

- CLAUDE.MD rules still apply: no `any`, no type assertions, no non-null assertions, `must()` in tests, no hand-run linters or formatters.
- **Determinism.** `renderKit` stays verbatim copy + block deletion + placeholder substitution. Structured subtraction happens in `init`, after render, exactly where structured addition already happens.
- **The kit must keep working.** Every change to a kit file is an added marker comment or nothing. No behaviour changes to the app while modularising it.
- **Peel, don't shard.** The registry starts with `base` owning everything, then modules are peeled off it one at a time. Coverage stays green at every commit.

---

### Task 1: Registry `exclude` and structured subtraction at init

**Files:**

- Modify: `packages/create-nuxt-starter/src/registry/schema.ts`
- Modify: `packages/create-nuxt-starter/src/commands/init.ts`
- Modify: `packages/create-nuxt-starter/test/commands/init.test.ts`
- Modify: `packages/create-nuxt-starter/test/fixtures/kit-v1/package.json`, `kit-v2/package.json`

**Interfaces:**

- Produces: `Registry` gains `exclude: string[]` (defaults to `[]`) — kit paths that deliberately belong to no module.
- Produces: `runInit` subtracts unselected modules' structured leaves from the rendered document.

The subtraction reuses `planStructuredChanges` rather than adding a second merge rule:

- `previous` = every registry module's fragment for the file (what the kit's committed file is expected to contain)
- `next` = the selected modules' fragments
- leaves in both → unchanged; leaves only in `previous` → removed; the document keeps everything no module declares

Reference counting falls out: `flatten` collapses all fragments into one map keyed by leaf path, so a dependency declared by both `auth` and `admin-users` survives when only one of them is installed.

- [x] **Step 1: Make the fixture kits mirror the real one** — move each module's dependencies into the fixture `package.json` so it is the union, exactly as the real kit is. The existing `structured` declarations stay as they are; they now describe entries the file already contains.

- [x] **Step 2: Write the failing test** (`test/commands/init.test.ts`)

```ts
it('drops unselected modules’ dependencies from package.json', async () => {
  const projectRoot = await initFixture(['base']);
  const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
  expect(pkg.dependencies).not.toHaveProperty('@nuxt/content');
  expect(pkg.dependencies).not.toHaveProperty('@vite-pwa/nuxt');
});

it('keeps a dependency a selected module still declares', async () => {
  const projectRoot = await initFixture(['content']);
  const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
  expect(pkg.dependencies).toHaveProperty('@nuxt/content');
  expect(pkg.dependencies).not.toHaveProperty('@vite-pwa/nuxt');
});
```

- [x] **Step 3: Run to verify it fails** — `npx vitest run test/commands/init.test.ts`
- [x] **Step 4: Implement** the `exclude` field and the subtraction in `runInit`.
- [x] **Step 5: Verify** — `npx vitest run && npm run typecheck` (all Plan 1–3 tests still green).
- [x] **Step 6: Commit** — `feat(cli): subtract unselected modules from structured files`

---

### Task 2: Kit coverage check

A test that fails when a kit file belongs to no module and is not excluded. This is what makes Task 3 a red/green loop instead of an audit.

**Files:**

- Create: `packages/create-nuxt-starter/test/registry/kitCoverage.test.ts`

**Interfaces:**

- Enumerates the kit with `git ls-files` at the repo root — the git tree is what `giget` ships, so it is the correct definition of "every kit file".
- Asserts: every tracked path is claimed by exactly one module or matched by `exclude`; every module path pattern matches at least one file; no `exclude` pattern is dead.

- [x] **Step 1: Write the test** against the current single-module registry (it passes trivially once `exclude` covers the CLI package and the superpowers docs).
- [x] **Step 2: Verify it fails** by temporarily removing a path from the registry.
- [x] **Step 3: Commit** — `test(cli): check every kit file belongs to a module`

---

### Task 3: Author the real registry and annotate the kit

The bulk of the work, done as one peel per commit so coverage and the generation matrix stay green throughout.

**Module set** (dependencies in parentheses):

| Module         | Owns                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------- |
| `base`         | Nuxt config, tailwind/theming, shadcn `ui/`, layouts, i18n, SEO, security, shared utilities |
| `pwa`          | `@vite-pwa/nuxt`, service worker, install prompter, offline page, pwa assets               |
| `content`      | `@nuxt/content`, `content.config.ts`, `content/`, `Ct*` components, docs + blog pages       |
| `database`     | NuxtHub D1, drizzle schema and migrations, `server/db/**`, `server/utils/db.ts`             |
| `auth`         | `nuxt-auth-utils`, auth pages/APIs, 2FA, passkeys, email verification (needs `database`)    |
| `admin-users`  | Admin users panel and its APIs (needs `auth`)                                               |
| `kit-extras`   | Feature flags, KV admin, Sentry, Turnstile, analytics                                       |

**Order correction found while executing:** the peels must run in _reverse_ dependency order, not dependency order. `database` cannot become optional while `auth` still requires it, so every dependent has to come out first: `pwa`, `content`, `admin-users`, `kit-extras`, `auth`, `database`.

- [x] **Step 1: Registry skeleton** — replace `full-starter` with `base` owning every non-excluded path, positively enumerated. (Output is not byte-identical after all: the CLI package, planning docs, `CLAUDE.MD`, lockfile and release workflow stop being copied into generated projects, which is the point of `exclude`.)
- [x] **Step 2: `pwa`** — service worker, install prompt, offline page, pwa-assets config.
- [x] **Step 3: `content`** — Nuxt Content, docs site, blog, MDC components, Studio. Base keeps the public site shell.
- [x] **Step 4: `admin-users`** — admin user screens and APIs.
- [ ] **Step 5: `kit-extras`** — feature flags, KV admin, OpenFeature provider.
- [ ] **Step 6: `auth`** — sessions, OAuth, 2FA, passkeys, email verification.
- [ ] **Step 7: `database`** — NuxtHub D1, drizzle schema and migrations.

For each:
  - move its paths out of `base` into the new module
  - wrap its fragments of `nuxt.config.ts`, `wrangler.jsonc`, and any shared file in `<nsk:id>` markers
  - declare its `package.json` entries in `structured`
  - verify: coverage green, `npm run typecheck` on the kit itself still clean, and the generation matrix entry for that module typechecks

**Positive enumeration, not negation.** `paths` has no exclude syntax and `resolveOwnership` errors on a pattern matching nothing, so `base` lists its directories explicitly rather than `**/*`. This is more verbose and much easier to review.

**Two ownership rules added while executing, both forced by the real kit:**

- **Ownership resolves over the whole registry, not the selection.** Otherwise `base`'s `app/components/**` swallows `InstallPrompter.vue` whenever `pwa` is left out, and renders it into projects that never asked for a PWA.
- **A pattern naming an existing file is a literal claim**, checked against the filesystem rather than scanned for glob metacharacters, and it beats any directory glob covering the same file. Without it `base` would have to enumerate several hundred files to let a module claim one of them — and `app/pages/[...slug].vue` could not be claimed at all, since every globber reads it as a bracket expression.

---

### Task 4: package.json consistency check

- [x] **Step 1:** Assert the union of every module's `structured['package.json']` equals the kit's real `package.json` dependencies and devDependencies, minus a kit-tooling allowlist (husky, commitlint, lint-staged, oxlint, oxfmt, eslint, vitest, the CLI's own build deps).
- [x] **Step 2:** Commit — `test(cli): check the registry declares every kit dependency`

This is the invariant Task 1's subtraction depends on: if the kit gains a dependency nobody declares, subtraction cannot know which module owns it, and the check fails loudly instead of shipping it to every project.

---

### Task 5: CI generation matrix

- [x] **Step 1:** Add `.github/workflows/cli-matrix.yml` generating `{base}`, `{base,pwa}`, `{base,content}`, `{base,database,auth}`, `{base,database,auth,admin-users}`, and all modules, then running `npm install`, `nuxt prepare`, and `nuxt typecheck` on each.
- [x] **Step 2:** Commit — `ci: typecheck every module combination`

This is the only real guard against undeclared coupling: a `base` file importing an `auth` composable compiles fine in the kit and fails here.

---

### Task 6: Document the module set

- [x] Update `packages/create-nuxt-starter/README.md` with the module table, what each owns, and the peel-don't-shard rule for adding a module later.

## Self-Review

**Gap coverage:** subtraction → Task 1; JSONC → Task 3 (markers, not `structured`); kit-only paths → Task 1's `exclude` plus Task 2's check.

**Risk:** Task 3 Step 2 is where undeclared coupling surfaces — `base` files importing auth or content symbols. The generation matrix catches it; the fix is either moving the file into the owning module or wrapping the import in markers. Expect this to be the slow part.

**Type consistency:** `exclude` is `string[]` validated by the existing `kitPathSchema`, so it accepts the same patterns `paths` does.
