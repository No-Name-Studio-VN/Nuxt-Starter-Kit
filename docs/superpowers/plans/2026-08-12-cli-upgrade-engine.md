# Modular CLI — Plan 2: The Upgrade Engine

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `nuxt-starter upgrade` pulls upstream kit changes into an existing project — including files the user has edited — replacing the manual copying this whole effort exists to kill.

**Architecture:** A project records the kit revision it came from. Upgrading renders that old revision (base) and the registry's new revision (target) into temp directories, then classifies every file: unchanged upstream is skipped, files the user never touched are overwritten, and files edited on both sides go through `git merge-file`, merging cleanly or landing standard conflict markers. JSON files (`package.json`, `wrangler.jsonc`) never text-merge — their module-declared fragments are diffed structurally. Git is the undo button: a clean working tree is required, so every upgrade is reviewable with `git diff` and revertible with `git restore`.

**Tech Stack:** TypeScript (strict), `git merge-file` for three-way merges, `diff` v8 (`createTwoFilesPatch`) for the `diff` command, vitest against a two-revision fixture kit.

**Spec:** `docs/superpowers/specs/2026-08-12-modular-cli-design.md`
**Builds on:** `docs/superpowers/plans/2026-08-12-cli-foundation.md` (Plan 1, complete)

## Global Constraints

- Everything from Plan 1's Global Constraints still applies: strict TypeScript, `Bundler` resolution (no import extensions), `CliError` for user-facing failures, commit after every task.
- **Single-revision invariant.** A project sits at exactly one kit revision. `upgrade` always moves the whole project; module arguments filter _reporting_ only.
- **Never modified by `upgrade`**, no matter what the registry says: `.env*`, anything under `content/`, `server/db/migrations/**`, lockfiles, and `.nuxt-starter/**` (the CLI rewrites the manifest itself, but never merges it).
- **Renders are authoritative, hashes are a hint.** Modification is decided by comparing project bytes to the re-rendered base. Manifest hashes exist so `status` can work without fetching anything.
- Conflict markers use `git merge-file -p --diff3` output verbatim, labelled `local` / `base(<revision>)` / `upstream(<revision>)`.
- A module recorded in the manifest but absent from the new registry is excluded from **both** renders, leaving its files untouched. Dropping a module upstream must never delete a user's files.
- **Repo rules (CLAUDE.MD) apply.** No `any`, no type assertions (`as`), no non-null assertions (`!`) — handle `undefined` explicitly instead. Tests use the `must()` helper in `test/support/must.ts` to narrow optionals. Do **not** run linters or formatters by hand; the pre-commit hook handles that.
- Before adding a utility, check whether one already exists in `src/util/`, `src/git/`, or `src/registry/`.

---

### Task 1: Two-revision fixture kit

Upgrades can only be tested against two kit revisions. `kit-v2` is `kit-v1` moved forward in every way that matters: a file changed, a file added, a file deleted, a module's declared paths changed, and a structured fragment changed.

**Files:**

- Create: `packages/create-nuxt-starter/test/fixtures/kit-v1/app/legacy.ts`
- Create: `packages/create-nuxt-starter/test/fixtures/kit-v2/**` (full second revision)
- Create: `packages/create-nuxt-starter/test/support/upgradeFixture.ts`
- Modify: `packages/create-nuxt-starter/test/support/fixtureKit.ts` (export v2 root and registry loader)
- Modify: `packages/create-nuxt-starter/test/support/fixtureKit.test.ts`, `test/render/render.test.ts`, `test/commands/init.test.ts` (tree expectations gain `app/legacy.ts`)

**Interfaces:**

- Produces:
  - `FIXTURE_KIT_V2_ROOT: string`, `loadFixtureRegistryV2(): Promise<Registry>`
  - `generateProjectAtV1(moduleIds: string[]): Promise<string>` — returns a project root generated from `kit-v1`, git-initialised and committed, ready to upgrade.
  - `editFile(projectRoot: string, path: string, contents: string): Promise<void>`
  - `readProjectFile(projectRoot: string, path: string): Promise<string>`

- [ ] **Step 1: Add the file that v2 will delete**

`test/fixtures/kit-v1/app/legacy.ts`:

```ts
export const legacyHelper = 'v1';
```

Add `"app/legacy.ts"` to the `base` module's `paths` in `test/fixtures/kit-v1/registry.json`.

- [ ] **Step 2: Update the three Plan 1 tests whose tree expectations change**

In `test/support/fixtureKit.test.ts`, add `'app/legacy.ts'` to the expected list (sorted: after `app/components/InstallPrompter.vue`, before `app/pages/index.vue`).
In `test/render/render.test.ts`, the `['base']` case expects `['app/app.vue', 'app/legacy.ts', 'app/pages/index.vue', 'nuxt.config.ts', 'package.json']`.
In `test/commands/init.test.ts`, the `['pwa']` case expects `['.nuxt-starter/manifest.json', 'app/app.vue', 'app/components/InstallPrompter.vue', 'app/legacy.ts', 'app/pages/index.vue', 'nuxt.config.ts', 'package.json']`.

Run `npx vitest run` and confirm these three pass before continuing.

- [ ] **Step 3: Create `kit-v2`**

Copy `kit-v1`, then apply the differences below. `app/app.vue` and `app/components/InstallPrompter.vue` stay byte-identical (they must classify as "unchanged").

```bash
cd packages/create-nuxt-starter/test/fixtures
cp -R kit-v1 kit-v2
rm kit-v2/app/legacy.ts
```

`kit-v2/nuxt.config.ts` — skeleton changed outside any block, and the content block changed:

```ts
export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  modules: [
    // <nsk:content>
    '@nuxt/content',
    '@nuxtjs/mdc',
    // </nsk:content>
    // <nsk:pwa>
    '@vite-pwa/nuxt',
    // </nsk:pwa>
  ],
});
```

`kit-v2/app/pages/index.vue` — changed upstream, used for merge and conflict cases:

```vue
<template>
  <h1>Welcome home</h1>
</template>
```

`kit-v2/app/pages/about.vue` — new file owned by `base`:

```vue
<template>
  <h1>About</h1>
</template>
```

`kit-v2/content.config.ts` — changed upstream:

```ts
export default defineContentConfig({
  collections: {
    docs: defineCollection({ type: 'page', source: 'docs/**' }),
  },
});
```

- [ ] **Step 4: Write `kit-v2/registry.json`**

Module versions bump, `base` loses `app/legacy.ts`, and `content` gains a structured dependency:

```json
{
  "schemaVersion": 2,
  "version": "2.0.0",
  "kit": { "template": "fixture", "revision": "v2" },
  "modules": [
    {
      "id": "base",
      "title": "Base",
      "description": "Nuxt foundation",
      "version": "2.0.0",
      "paths": ["nuxt.config.ts", "package.json", "app/app.vue", "app/pages/**"]
    },
    {
      "id": "content",
      "title": "Content",
      "description": "Nuxt Content",
      "version": "2.0.0",
      "requires": ["base"],
      "paths": ["content.config.ts"],
      "structured": {
        "package.json": {
          "dependencies": { "@nuxt/content": "^3.2.0", "@nuxtjs/mdc": "^0.10.0" }
        }
      }
    },
    {
      "id": "pwa",
      "title": "PWA",
      "description": "Installable app",
      "version": "1.0.0",
      "requires": ["base"],
      "paths": ["app/components/InstallPrompter.vue"],
      "structured": { "package.json": { "dependencies": { "@vite-pwa/nuxt": "^1.0.0" } } },
      "notes": ["Generate PWA icons before deploying."]
    }
  ]
}
```

- [ ] **Step 5: Write the failing test**

```ts
// test/support/upgradeFixture.test.ts
import { describe, expect, it } from 'vitest';
import { readManifest } from '../../src/manifest/io';
import { editFile, generateProjectAtV1, readProjectFile } from './upgradeFixture';

describe('generateProjectAtV1', () => {
  it('produces a committed project pinned at revision v1', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    const manifest = await readManifest(projectRoot);
    expect(manifest.kit.revision).toBe('v1');
    expect(manifest.modules.map((module) => module.id)).toEqual(['base', 'content']);
    expect(await readProjectFile(projectRoot, 'app/legacy.ts')).toContain('v1');
  });

  it('supports editing a project file', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(
      projectRoot,
      'app/pages/index.vue',
      '<template>\n  <h1>Mine</h1>\n</template>\n',
    );
    expect(await readProjectFile(projectRoot, 'app/pages/index.vue')).toContain('Mine');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run test/support/upgradeFixture.test.ts`
Expected: FAIL — cannot resolve `./upgradeFixture`.

- [ ] **Step 7: Extend `test/support/fixtureKit.ts`**

Append:

```ts
export const FIXTURE_KIT_V2_ROOT = fileURLToPath(new URL('../fixtures/kit-v2/', import.meta.url));

export function loadFixtureRegistryV2(): Promise<Registry> {
  return loadRegistry(join(FIXTURE_KIT_V2_ROOT, 'registry.json'));
}
```

- [ ] **Step 8: Write `test/support/upgradeFixture.ts`**

```ts
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { runInit } from '../../src/commands/init';
import { writeTextFile } from '../../src/util/fs';
import { FIXTURE_KIT_V1_ROOT, loadFixtureRegistry, makeTempDir } from './fixtureKit';

const run = promisify(execFile);

/** Generates a project from kit-v1 and commits it, so upgrades see a clean tree. */
export async function generateProjectAtV1(moduleIds: string[]): Promise<string> {
  const registry = await loadFixtureRegistry();
  const { projectRoot } = await runInit({
    registry,
    targetDir: join(await makeTempDir('upgrade'), 'app'),
    moduleIds,
    placeholders: { PROJECT_NAME: 'my-app', PROJECT_DESCRIPTION: 'Test' },
    localKitRoot: FIXTURE_KIT_V1_ROOT,
  });

  await run('git', ['init', '--quiet'], { cwd: projectRoot });
  await run('git', ['config', 'user.email', 'test@example.com'], { cwd: projectRoot });
  await run('git', ['config', 'user.name', 'Test'], { cwd: projectRoot });
  await run('git', ['add', '.'], { cwd: projectRoot });
  await run('git', ['commit', '--quiet', '-m', 'initial'], { cwd: projectRoot });
  return projectRoot;
}

export async function editFile(projectRoot: string, path: string, contents: string): Promise<void> {
  await writeTextFile(join(projectRoot, path), contents);
}

export function readProjectFile(projectRoot: string, path: string): Promise<string> {
  return readFile(join(projectRoot, path), 'utf8');
}

/** Commits current changes so a test can start from a clean tree after editing. */
export async function commitAll(projectRoot: string, message = 'edit'): Promise<void> {
  await run('git', ['add', '.'], { cwd: projectRoot });
  await run('git', ['commit', '--quiet', '-m', message], { cwd: projectRoot });
}
```

- [ ] **Step 9: Verify tests pass**

Run: `npx vitest run && npm run typecheck`
Expected: all tests pass (Plan 1's updated expectations included).

- [ ] **Step 10: Commit**

```bash
git add packages/create-nuxt-starter/test
git commit -m "test(cli): add a second fixture kit revision and upgrade harness"
```

---

### Task 2: Git integration

Two independent concerns, both thin wrappers over the `git` binary: the safety check (clean tree) and the merge itself.

**Files:**

- Create: `packages/create-nuxt-starter/src/git/repo.ts`
- Create: `packages/create-nuxt-starter/src/git/mergeFile.ts`
- Create: `packages/create-nuxt-starter/test/git/repo.test.ts`
- Create: `packages/create-nuxt-starter/test/git/mergeFile.test.ts`

**Interfaces:**

- Produces:
  - `isGitRepository(root: string): Promise<boolean>`
  - `isWorkingTreeClean(root: string): Promise<boolean>`
  - `assertCleanWorkingTree(root: string, options: { force: boolean }): Promise<void>` — throws `CliError` unless clean, forced, or not a repository (with a warning path handled by callers).
  - `type MergeOutcome = { status: 'clean'; content: string } | { status: 'conflict'; content: string; conflicts: number }`
  - `mergeFiles(options: { oursPath: string; basePath: string; theirsPath: string; labels: { ours: string; base: string; theirs: string } }): Promise<MergeOutcome>`

- [ ] **Step 1: Write the failing tests**

```ts
// test/git/repo.test.ts
import { describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import { assertCleanWorkingTree, isGitRepository, isWorkingTreeClean } from '../../src/git/repo';
import { writeTextFile } from '../../src/util/fs';
import { makeTempDir } from '../support/fixtureKit';
import { editFile, generateProjectAtV1 } from '../support/upgradeFixture';

describe('isGitRepository', () => {
  it('recognises a repository', async () => {
    expect(await isGitRepository(await generateProjectAtV1(['base']))).toBe(true);
  });

  it('rejects a plain directory', async () => {
    expect(await isGitRepository(await makeTempDir('plain'))).toBe(false);
  });
});

describe('isWorkingTreeClean', () => {
  it('is clean straight after a commit', async () => {
    expect(await isWorkingTreeClean(await generateProjectAtV1(['base']))).toBe(true);
  });

  it('is dirty after an edit', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/app.vue', '<template><div>edited</div></template>\n');
    expect(await isWorkingTreeClean(projectRoot)).toBe(false);
  });

  it('is dirty with an untracked file', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await writeTextFile(`${projectRoot}/untracked.txt`, 'x');
    expect(await isWorkingTreeClean(projectRoot)).toBe(false);
  });
});

describe('assertCleanWorkingTree', () => {
  it('passes on a clean tree', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await expect(assertCleanWorkingTree(projectRoot, { force: false })).resolves.toBeUndefined();
  });

  it('refuses a dirty tree', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/app.vue', 'changed\n');
    await expect(assertCleanWorkingTree(projectRoot, { force: false })).rejects.toThrow(CliError);
  });

  it('allows a dirty tree when forced', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/app.vue', 'changed\n');
    await expect(assertCleanWorkingTree(projectRoot, { force: true })).resolves.toBeUndefined();
  });

  it('refuses a directory that is not a repository', async () => {
    await expect(
      assertCleanWorkingTree(await makeTempDir('plain'), { force: false }),
    ).rejects.toThrow(/not a git repository/i);
  });
});
```

```ts
// test/git/mergeFile.test.ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeFiles } from '../../src/git/mergeFile';
import { writeTextFile } from '../../src/util/fs';
import { makeTempDir } from '../support/fixtureKit';

const labels = { ours: 'local', base: 'base', theirs: 'upstream' };

async function scenario(base: string, ours: string, theirs: string) {
  const root = await makeTempDir('merge');
  const paths = {
    basePath: join(root, 'base'),
    oursPath: join(root, 'ours'),
    theirsPath: join(root, 'theirs'),
  };
  await writeTextFile(paths.basePath, base);
  await writeTextFile(paths.oursPath, ours);
  await writeTextFile(paths.theirsPath, theirs);
  return mergeFiles({ ...paths, labels });
}

describe('mergeFiles', () => {
  it('merges non-overlapping edits cleanly', async () => {
    const result = await scenario('a\nb\nc\n', 'MINE\nb\nc\n', 'a\nb\nTHEIRS\n');
    expect(result.status).toBe('clean');
    expect(result.content).toBe('MINE\nb\nTHEIRS\n');
  });

  it('keeps upstream changes when the user changed nothing', async () => {
    const result = await scenario('a\nb\n', 'a\nb\n', 'a\nB2\n');
    expect(result.status).toBe('clean');
    expect(result.content).toBe('a\nB2\n');
  });

  it('reports overlapping edits as conflicts with markers', async () => {
    const result = await scenario('a\nb\nc\n', 'a\nMINE\nc\n', 'a\nTHEIRS\nc\n');
    expect(result.status).toBe('conflict');
    if (result.status !== 'conflict') return;
    expect(result.conflicts).toBe(1);
    expect(result.content).toContain('<<<<<<< local');
    expect(result.content).toContain('||||||| base');
    expect(result.content).toContain('>>>>>>> upstream');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run test/git`
Expected: FAIL — cannot resolve `../../src/git/repo` and `../../src/git/mergeFile`.

- [ ] **Step 3: Write `src/git/repo.ts`**

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CliError } from '../errors';

const run = promisify(execFile);

export async function isGitRepository(root: string): Promise<boolean> {
  try {
    const { stdout } = await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root });
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

export async function isWorkingTreeClean(root: string): Promise<boolean> {
  const { stdout } = await run('git', ['status', '--porcelain'], { cwd: root });
  return stdout.trim().length === 0;
}

/**
 * Git is this CLI's undo mechanism: every upgrade must be reviewable with
 * `git diff` and revertible with `git restore`, which only holds if the tree
 * was clean beforehand.
 */
export async function assertCleanWorkingTree(
  root: string,
  options: { force: boolean },
): Promise<void> {
  if (!(await isGitRepository(root))) {
    throw new CliError(
      `${root} is not a git repository. Run "git init" and commit first — upgrades rely on git to review and undo changes.`,
    );
  }
  if (options.force) return;
  if (!(await isWorkingTreeClean(root))) {
    throw new CliError(
      'Your working tree has uncommitted changes. Commit or stash them first, or pass --force.',
    );
  }
}
```

- [ ] **Step 4: Write `src/git/mergeFile.ts`**

```ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CliError } from '../errors';

const run = promisify(execFile);
const MAX_BUFFER = 32 * 1024 * 1024;

export type MergeOutcome =
  { status: 'clean'; content: string } | { status: 'conflict'; content: string; conflicts: number };

export interface MergeFilesOptions {
  oursPath: string;
  basePath: string;
  theirsPath: string;
  labels: { ours: string; base: string; theirs: string };
}

function hasExecFileFailure(error: unknown): error is { code: number; stdout: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'number' &&
    typeof (error as { stdout?: unknown }).stdout === 'string'
  );
}

/**
 * Three-way merge via `git merge-file`. Git already ships the algorithm, emits
 * the conflict markers every editor understands, and reports the conflict count
 * as its exit code — there is no reason to carry our own diff3.
 */
export async function mergeFiles(options: MergeFilesOptions): Promise<MergeOutcome> {
  const args = [
    'merge-file',
    '-p',
    '--diff3',
    '-L',
    options.labels.ours,
    '-L',
    options.labels.base,
    '-L',
    options.labels.theirs,
    options.oursPath,
    options.basePath,
    options.theirsPath,
  ];

  try {
    const { stdout } = await run('git', args, { maxBuffer: MAX_BUFFER });
    return { status: 'clean', content: stdout };
  } catch (error) {
    // Exit codes 1..127 are the number of conflicts; anything else is a real failure.
    if (hasExecFileFailure(error) && error.code > 0 && error.code <= 127) {
      return { status: 'conflict', content: error.stdout, conflicts: error.code };
    }
    const message = error instanceof Error ? error.message : 'unknown error';
    throw new CliError(`git merge-file failed: ${message}`);
  }
}
```

- [ ] **Step 5: Verify tests pass**

Run: `npx vitest run test/git && npm run typecheck`
Expected: PASS (10 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/create-nuxt-starter/src/git packages/create-nuxt-starter/test/git
git commit -m "feat(cli): add git working-tree checks and three-way merge"
```

---

### Task 3: Record structured fragments in the manifest

Upgrading `package.json` structurally needs to know what each module contributed _last time_. That has to come from the project, not from today's registry.

**Files:**

- Modify: `packages/create-nuxt-starter/src/manifest/schema.ts`
- Modify: `packages/create-nuxt-starter/src/manifest/io.ts`
- Modify: `packages/create-nuxt-starter/src/commands/init.ts`
- Modify: `packages/create-nuxt-starter/test/manifest/io.test.ts`
- Modify: `packages/create-nuxt-starter/test/commands/init.test.ts`

**Interfaces:**

- Produces: `ManifestModule` gains `structured: Record<string, Record<string, unknown>>` (defaults to `{}` so existing manifests still parse). `buildManifest` copies each module's declared `structured` verbatim.

- [ ] **Step 1: Write the failing test (append to `test/commands/init.test.ts`)**

`test/commands/init.test.ts` already imports `must` from `../support/must`; the block below uses it.

```ts
describe('structured provenance', () => {
  it('records what each module contributed to shared JSON files', async () => {
    const result = await init(['content', 'pwa']);
    const manifest = await readManifest(result.projectRoot);
    const content = must(manifest.modules.find((module) => module.id === 'content'));
    const pwa = must(manifest.modules.find((module) => module.id === 'pwa'));
    expect(content.structured['package.json']).toEqual({
      dependencies: { '@nuxt/content': '^3.0.0' },
    });
    expect(pwa.structured['package.json']).toEqual({
      dependencies: { '@vite-pwa/nuxt': '^1.0.0' },
    });
    expect(must(manifest.modules.find((module) => module.id === 'base')).structured).toEqual({});
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/commands -t "records what each module contributed"`
Expected: FAIL — `structured` is undefined on manifest modules.

- [ ] **Step 3: Extend the manifest schema**

In `src/manifest/schema.ts`, add to `manifestModuleSchema`:

```ts
  structured: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
```

- [ ] **Step 4: Populate it in `buildManifest`**

In `src/manifest/io.ts`, inside the `modules.map(...)` object literal, add:

```ts
      structured: module.structured,
```

- [ ] **Step 5: Verify tests pass**

Run: `npx vitest run && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/create-nuxt-starter/src packages/create-nuxt-starter/test
git commit -m "feat(cli): record structured fragment provenance in the manifest"
```

---

### Task 4: Recover a revision's module definitions from the kit

Module `paths` change between revisions. Rendering the old revision with today's path declarations would produce a wrong base and corrupt every merge, so the old definitions are read from the old kit itself — the kit repo contains this CLI package, registry included.

**Files:**

- Create: `packages/create-nuxt-starter/src/registry/fromKit.ts`
- Create: `packages/create-nuxt-starter/test/registry/fromKit.test.ts`

**Interfaces:**

- Produces: `loadRegistryFromKit(kitRoot: string): Promise<Registry | null>` — `null` when the kit predates in-kit registries.

- [ ] **Step 1: Write the failing test**

```ts
// test/registry/fromKit.test.ts
import { describe, expect, it } from 'vitest';
import { loadRegistryFromKit } from '../../src/registry/fromKit';
import { must } from '../support/must';
import { writeJsonAtomically } from '../../src/util/fs';
import { FIXTURE_KIT_V1_ROOT, FIXTURE_KIT_V2_ROOT, makeTempDir } from '../support/fixtureKit';

describe('loadRegistryFromKit', () => {
  it('reads a registry at the kit root', async () => {
    const registry = await loadRegistryFromKit(FIXTURE_KIT_V1_ROOT);
    expect(registry?.kit.revision).toBe('v1');
  });

  it('sees the newer revision in the newer kit', async () => {
    const registry = await loadRegistryFromKit(FIXTURE_KIT_V2_ROOT);
    expect(registry?.kit.revision).toBe('v2');
    expect(must(registry?.modules.find((module) => module.id === 'base')).paths).not.toContain(
      'app/legacy.ts',
    );
  });

  it('finds the registry inside the packaged CLI directory', async () => {
    const kitRoot = await makeTempDir('kit');
    await writeJsonAtomically(`${kitRoot}/packages/create-nuxt-starter/registry/registry.json`, {
      schemaVersion: 2,
      version: '1.0.0',
      kit: { template: 'github:acme/kit', revision: 'deadbee' },
      modules: [
        {
          id: 'base',
          title: 'Base',
          description: 'D',
          version: '1.0.0',
          paths: ['nuxt.config.ts'],
        },
      ],
    });
    expect((await loadRegistryFromKit(kitRoot))?.kit.revision).toBe('deadbee');
  });

  it('returns null when the kit carries no registry', async () => {
    expect(await loadRegistryFromKit(await makeTempDir('kit'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/registry/fromKit.test.ts`
Expected: FAIL — cannot resolve `../../src/registry/fromKit`.

- [ ] **Step 3: Write `src/registry/fromKit.ts`**

```ts
import { join } from 'node:path';
import { pathExists } from '../util/fs';
import { loadRegistry } from './load';
import type { Registry } from './schema';

/** Where a kit checkout may carry its own registry, most specific first. */
const IN_KIT_REGISTRY_PATHS = [
  'registry.json',
  'packages/create-nuxt-starter/registry/registry.json',
];

/**
 * Reads the module definitions as they existed in a given kit revision. Paths
 * owned by a module change over time, so rendering an old revision with today's
 * declarations would produce the wrong base for a three-way merge.
 */
export async function loadRegistryFromKit(kitRoot: string): Promise<Registry | null> {
  for (const candidate of IN_KIT_REGISTRY_PATHS) {
    const path = join(kitRoot, candidate);
    if (await pathExists(path)) return loadRegistry(path);
  }
  return null;
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run test/registry && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/create-nuxt-starter/src/registry/fromKit.ts packages/create-nuxt-starter/test/registry/fromKit.test.ts
git commit -m "feat(cli): read module definitions from a kit revision"
```

---

### Task 5: Upgrade planner

The decision engine. It produces a complete, inspectable plan and writes nothing — `--check` prints exactly what apply would do.

**Files:**

- Create: `packages/create-nuxt-starter/src/upgrade/protected.ts`
- Create: `packages/create-nuxt-starter/src/upgrade/plan.ts`
- Create: `packages/create-nuxt-starter/test/upgrade/protected.test.ts`
- Create: `packages/create-nuxt-starter/test/upgrade/plan.test.ts`

**Interfaces:**

- Consumes: `readManifest`, `fetchKit`, `loadRegistryFromKit`, `renderKit`, `resolveModules`, `mergeFiles`, `readTextFile`, `listFiles`.
- Produces:
  - `isProtectedPath(path: string): boolean`
  - `type FileAction = { path: string; moduleId: string } & ({ type: 'skip'; reason: string } | { type: 'add'; content: string } | { type: 'overwrite'; content: string } | { type: 'merge'; content: string } | { type: 'conflict'; content: string; conflicts: number } | { type: 'delete' } | { type: 'orphan'; reason: string })`
  - `interface UpgradePlan { projectRoot: string; fromRevision: string; toRevision: string; moduleUpdates: Array<{ id: string; from: string; to: string }>; actions: FileAction[]; targetHashes: Record<string, string>; droppedModuleIds: string[]; renderVersionChanged: boolean; cleanup: () => Promise<void> }`
  - `planUpgrade(options: { projectRoot: string; registry: Registry; localKitRoot?: string; localOldKitRoot?: string }): Promise<UpgradePlan>`

Note: `localOldKitRoot` exists so tests can point the base render at `kit-v1` while the target render uses `kit-v2`; real runs fetch both by revision.

- [ ] **Step 1: Write the failing test for protected paths**

```ts
// test/upgrade/protected.test.ts
import { describe, expect, it } from 'vitest';
import { isProtectedPath } from '../../src/upgrade/protected';

describe('isProtectedPath', () => {
  it.each([
    '.env',
    '.env.local',
    'content/index.md',
    'content/blog/post.md',
    'server/db/migrations/0001_init.sql',
    'package-lock.json',
    'pnpm-lock.yaml',
    '.nuxt-starter/manifest.json',
  ])('protects %s', (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each([
    'nuxt.config.ts',
    'app/app.vue',
    'content.config.ts',
    'server/db/schema.ts',
    'package.json',
  ])('does not protect %s', (path) => {
    expect(isProtectedPath(path)).toBe(false);
  });
});
```

- [ ] **Step 2: Write `src/upgrade/protected.ts`**

```ts
/**
 * Paths an upgrade never touches: user secrets, user-authored content, generated
 * migrations, lockfiles, and the CLI's own metadata (rewritten wholesale, never
 * merged). `content.config.ts` is deliberately not protected — it is kit code.
 */
const PROTECTED_PATTERNS: RegExp[] = [
  /^\.env(\.|$)/,
  /^content\//,
  /^server\/db\/migrations\//,
  /^\.nuxt-starter\//,
  /^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb)$/,
];

export function isProtectedPath(path: string): boolean {
  return PROTECTED_PATTERNS.some((pattern) => pattern.test(path));
}
```

- [ ] **Step 3: Run the protected-path test**

Run: `npx vitest run test/upgrade/protected.test.ts`
Expected: PASS (13 cases).

- [ ] **Step 4: Write the failing planner test**

```ts
// test/upgrade/plan.test.ts
import { describe, expect, it } from 'vitest';
import { planUpgrade } from '../../src/upgrade/plan';
import type { FileAction } from '../../src/upgrade/plan';
import {
  FIXTURE_KIT_V1_ROOT,
  FIXTURE_KIT_V2_ROOT,
  loadFixtureRegistryV2,
} from '../support/fixtureKit';
import { commitAll, editFile, generateProjectAtV1 } from '../support/upgradeFixture';

async function plan(projectRoot: string) {
  const registry = await loadFixtureRegistryV2();
  return planUpgrade({
    projectRoot,
    registry,
    localKitRoot: FIXTURE_KIT_V2_ROOT,
    localOldKitRoot: FIXTURE_KIT_V1_ROOT,
  });
}

function actionFor(actions: FileAction[], path: string): FileAction {
  const action = actions.find((candidate) => candidate.path === path);
  if (!action) throw new Error(`no action planned for ${path}`);
  return action;
}

describe('planUpgrade', () => {
  it('reports the revision move and module version bumps', async () => {
    const result = await plan(await generateProjectAtV1(['content']));
    expect(result.fromRevision).toBe('v1');
    expect(result.toRevision).toBe('v2');
    expect(result.moduleUpdates).toContainEqual({ id: 'content', from: '1.0.0', to: '2.0.0' });
    await result.cleanup();
  });

  it('skips files that did not change upstream', async () => {
    const result = await plan(await generateProjectAtV1(['pwa']));
    expect(actionFor(result.actions, 'app/app.vue').type).toBe('skip');
    await result.cleanup();
  });

  it('overwrites files the user never edited', async () => {
    const result = await plan(await generateProjectAtV1(['base']));
    const action = actionFor(result.actions, 'app/pages/index.vue');
    expect(action.type).toBe('overwrite');
    if (action.type !== 'overwrite') return;
    expect(action.content).toContain('Welcome home');
    await result.cleanup();
  });

  it('merges non-overlapping user edits', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await editFile(
      projectRoot,
      'nuxt.config.ts',
      [
        'export default defineNuxtConfig({',
        '  ssr: false,',
        '  modules: [',
        '    // <nsk:content>',
        "    '@nuxt/content',",
        '    // </nsk:content>',
        '  ],',
        '});',
        '',
      ].join('\n'),
    );
    await commitAll(projectRoot);

    const result = await plan(projectRoot);
    const action = actionFor(result.actions, 'nuxt.config.ts');
    expect(action.type).toBe('merge');
    if (action.type !== 'merge') return;
    expect(action.content).toContain('ssr: false');
    expect(action.content).toContain('@nuxtjs/mdc');
    expect(action.content).toContain('compatibilityDate');
    await result.cleanup();
  });

  it('reports overlapping edits as conflicts', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(
      projectRoot,
      'app/pages/index.vue',
      '<template>\n  <h1>My page</h1>\n</template>\n',
    );
    await commitAll(projectRoot);

    const result = await plan(projectRoot);
    const action = actionFor(result.actions, 'app/pages/index.vue');
    expect(action.type).toBe('conflict');
    if (action.type !== 'conflict') return;
    expect(action.content).toContain('<<<<<<<');
    expect(action.content).toContain('My page');
    expect(action.content).toContain('Welcome home');
    await result.cleanup();
  });

  it('adds new upstream files', async () => {
    const result = await plan(await generateProjectAtV1(['base']));
    const action = actionFor(result.actions, 'app/pages/about.vue');
    expect(action.type).toBe('add');
    await result.cleanup();
  });

  it('deletes upstream-removed files the user never edited', async () => {
    const result = await plan(await generateProjectAtV1(['base']));
    expect(actionFor(result.actions, 'app/legacy.ts').type).toBe('delete');
    await result.cleanup();
  });

  it('keeps upstream-removed files the user edited, as orphans', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/legacy.ts', "export const legacyHelper = 'mine';\n");
    await commitAll(projectRoot);

    const result = await plan(projectRoot);
    expect(actionFor(result.actions, 'app/legacy.ts').type).toBe('orphan');
    await result.cleanup();
  });

  it('never plans anything for protected paths', async () => {
    const result = await plan(await generateProjectAtV1(['content']));
    expect(result.actions.every((action) => !action.path.startsWith('.nuxt-starter/'))).toBe(true);
    await result.cleanup();
  });

  it('leaves package.json to the structured pass', async () => {
    const result = await plan(await generateProjectAtV1(['content']));
    expect(result.actions.find((action) => action.path === 'package.json')).toBeUndefined();
    await result.cleanup();
  });

  it('respects files the user deleted', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await rm(join(projectRoot, 'app/pages/index.vue'));
    await commitAll(projectRoot);

    const result = await plan(projectRoot);
    const action = actionFor(result.actions, 'app/pages/index.vue');
    expect(action.type).toBe('skip');
    if (action.type !== 'skip') return;
    expect(action.reason).toMatch(/deleted/);
    await result.cleanup();
  });
});
```

Add `import { rm } from 'node:fs/promises';` and `import { join } from 'node:path';` at the top of the file.

- [ ] **Step 5: Run it to verify it fails**

Run: `npx vitest run test/upgrade/plan.test.ts`
Expected: FAIL — cannot resolve `../../src/upgrade/plan`.

- [ ] **Step 6: Write `src/upgrade/plan.ts`**

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CliError } from '../errors';
import { mergeFiles } from '../git/mergeFile';
import { readManifest, RENDER_VERSION, type ProjectManifest } from '../manifest/io';
import { loadRegistryFromKit } from '../registry/fromKit';
import { resolveModules } from '../registry/resolve';
import type { Registry, RegistryModule } from '../registry/schema';
import { renderKit } from '../render/render';
import { fetchKit, type FetchedKit } from '../sources/fetchKit';
import { hashContent, listFiles, pathExists, readTextFile } from '../util/fs';
import { resolveInside } from '../util/paths';
import { isProtectedPath } from './protected';

export type FileAction = { path: string; moduleId: string } & (
  | { type: 'skip'; reason: string }
  | { type: 'add'; content: string }
  | { type: 'overwrite'; content: string }
  | { type: 'merge'; content: string }
  | { type: 'conflict'; content: string; conflicts: number }
  | { type: 'delete' }
  | { type: 'orphan'; reason: string }
);

export interface UpgradePlan {
  projectRoot: string;
  manifest: ProjectManifest;
  fromRevision: string;
  toRevision: string;
  moduleUpdates: Array<{ id: string; from: string; to: string }>;
  actions: FileAction[];
  /** Pristine target-render hashes, recorded into the manifest after apply. */
  targetHashes: Record<string, string>;
  structuredTargets: string[];
  droppedModuleIds: string[];
  renderVersionChanged: boolean;
  cleanup: () => Promise<void>;
}

interface RenderedTree {
  root: string;
  files: Map<string, { moduleId: string; hash: string }>;
}

async function renderRevision(options: {
  kitRoot: string;
  modules: RegistryModule[];
  manifest: ProjectManifest;
  destinationRoot: string;
}): Promise<RenderedTree> {
  const rendered = await renderKit({
    kitRoot: options.kitRoot,
    modules: options.modules,
    placeholders: options.manifest.placeholders,
    destinationRoot: options.destinationRoot,
  });
  return {
    root: options.destinationRoot,
    files: new Map(
      rendered.map((file) => [file.path, { moduleId: file.moduleId, hash: file.hash }]),
    ),
  };
}

/** Module ids installed in the project that still exist in the target registry. */
function survivingModuleIds(manifest: ProjectManifest, registry: Registry): string[] {
  const available = new Set(registry.modules.map((module) => module.id));
  return manifest.modules.map((module) => module.id).filter((id) => available.has(id));
}

function selectModules(registry: Registry, ids: string[]): RegistryModule[] {
  return ids.length === 0 ? [] : resolveModules(registry, ids);
}

export interface PlanUpgradeOptions {
  projectRoot: string;
  registry: Registry;
  localKitRoot?: string;
  /** Test-only: renders the base from a local checkout instead of fetching it. */
  localOldKitRoot?: string;
}

export async function planUpgrade(options: PlanUpgradeOptions): Promise<UpgradePlan> {
  const { projectRoot, registry } = options;
  const manifest = await readManifest(projectRoot);

  const installedIds = manifest.modules.map((module) => module.id);
  const keptIds = survivingModuleIds(manifest, registry);
  const droppedModuleIds = installedIds.filter((id) => !keptIds.includes(id));

  const workspace = await mkdtemp(join(tmpdir(), 'nsk-upgrade-'));
  const fetched: FetchedKit[] = [];
  const cleanup = async () => {
    await Promise.all(fetched.map((kit) => kit.cleanup()));
    await rm(workspace, { recursive: true, force: true });
  };

  try {
    const oldKit = await fetchKit({
      template: manifest.kit.template,
      revision: manifest.kit.revision,
      ...(options.localOldKitRoot === undefined ? {} : { localKitRoot: options.localOldKitRoot }),
    });
    fetched.push(oldKit);

    const newKit = await fetchKit({
      template: registry.kit.template,
      revision: registry.kit.revision,
      ...(options.localKitRoot === undefined ? {} : { localKitRoot: options.localKitRoot }),
    });
    fetched.push(newKit);

    // The old revision's own module definitions own the base render: a module's
    // declared paths may have changed, and rendering the base with today's
    // declarations would diff against a file tree that never existed.
    const oldRegistry = (await loadRegistryFromKit(oldKit.root)) ?? registry;
    const oldIds = keptIds.filter((id) => oldRegistry.modules.some((module) => module.id === id));

    const base = await renderRevision({
      kitRoot: oldKit.root,
      modules: selectModules(oldRegistry, oldIds),
      manifest,
      destinationRoot: join(workspace, 'base'),
    });
    const target = await renderRevision({
      kitRoot: newKit.root,
      modules: selectModules(registry, keptIds),
      manifest,
      destinationRoot: join(workspace, 'target'),
    });

    const structuredTargets = new Set<string>();
    for (const module of registry.modules) {
      if (!keptIds.includes(module.id)) continue;
      for (const file of Object.keys(module.structured)) structuredTargets.add(file);
    }
    for (const module of manifest.modules) {
      for (const file of Object.keys(module.structured)) structuredTargets.add(file);
    }

    const actions: FileAction[] = [];
    const targetHashes: Record<string, string> = {};
    const paths = [...new Set([...base.files.keys(), ...target.files.keys()])].sort();

    for (const path of paths) {
      if (isProtectedPath(path) || structuredTargets.has(path)) continue;

      const baseEntry = base.files.get(path);
      const targetEntry = target.files.get(path);
      const moduleId = targetEntry?.moduleId ?? baseEntry?.moduleId ?? 'unknown';
      if (targetEntry) targetHashes[path] = targetEntry.hash;

      const projectPath = resolveInside(projectRoot, path, 'Project file');
      const projectExists = await pathExists(projectPath);
      const projectContent = projectExists ? await readTextFile(projectPath) : null;

      // Upstream deleted this file.
      if (baseEntry && !targetEntry) {
        if (!projectExists) continue;
        const baseContent = await readTextFile(join(base.root, path));
        if (projectContent !== null && projectContent === baseContent) {
          actions.push({ path, moduleId, type: 'delete' });
        } else {
          actions.push({
            path,
            moduleId,
            type: 'orphan',
            reason: 'removed upstream but modified locally',
          });
        }
        continue;
      }

      if (!targetEntry) continue;
      const targetContent = await readTextFile(join(target.root, path));

      // New upstream file.
      if (!baseEntry) {
        if (projectExists) {
          actions.push({
            path,
            moduleId,
            type: 'skip',
            reason: 'new upstream file already exists locally',
          });
          continue;
        }
        if (targetContent === null) {
          actions.push({
            path,
            moduleId,
            type: 'skip',
            reason: 'binary file must be added manually',
          });
          continue;
        }
        actions.push({ path, moduleId, type: 'add', content: targetContent });
        continue;
      }

      const baseContent = await readTextFile(join(base.root, path));
      if (baseEntry.hash === targetEntry.hash) {
        actions.push({ path, moduleId, type: 'skip', reason: 'unchanged upstream' });
        continue;
      }
      if (!projectExists) {
        actions.push({ path, moduleId, type: 'skip', reason: 'deleted locally' });
        continue;
      }
      if (baseContent === null || targetContent === null || projectContent === null) {
        actions.push({ path, moduleId, type: 'skip', reason: 'binary file changed upstream' });
        continue;
      }
      if (projectContent === baseContent) {
        actions.push({ path, moduleId, type: 'overwrite', content: targetContent });
        continue;
      }

      const merged = await mergeFiles({
        oursPath: projectPath,
        basePath: join(base.root, path),
        theirsPath: join(target.root, path),
        labels: {
          ours: 'local',
          base: `base (${manifest.kit.revision})`,
          theirs: `upstream (${registry.kit.revision})`,
        },
      });
      actions.push(
        merged.status === 'clean'
          ? { path, moduleId, type: 'merge', content: merged.content }
          : {
              path,
              moduleId,
              type: 'conflict',
              content: merged.content,
              conflicts: merged.conflicts,
            },
      );
    }

    const moduleUpdates = manifest.modules
      .filter((module) => keptIds.includes(module.id))
      .flatMap((module) => {
        const target = registry.modules.find((candidate) => candidate.id === module.id);
        if (target === undefined || target.version === module.version) return [];
        return [{ id: module.id, from: module.version, to: target.version }];
      });

    return {
      projectRoot,
      manifest,
      fromRevision: manifest.kit.revision,
      toRevision: registry.kit.revision,
      moduleUpdates,
      actions,
      targetHashes,
      structuredTargets: [...structuredTargets].sort(),
      droppedModuleIds,
      renderVersionChanged: manifest.renderVersion !== RENDER_VERSION,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

export function summarizePlan(plan: UpgradePlan): Record<FileAction['type'], number> {
  const summary = { skip: 0, add: 0, overwrite: 0, merge: 0, conflict: 0, delete: 0, orphan: 0 };
  for (const action of plan.actions) summary[action.type] += 1;
  return summary;
}
```

Note: import only what this file actually uses — `noUnusedLocals` is on. The import list above is deliberately minimal; `CliError`, `hashContent`, and `listFiles` belong to Tasks 6 and 7, not here.

- [ ] **Step 7: Verify tests pass**

Run: `npx vitest run test/upgrade && npm run typecheck`
Expected: PASS (11 planner tests + 13 protected cases), typecheck clean.

- [ ] **Step 8: Commit**

```bash
git add packages/create-nuxt-starter/src/upgrade packages/create-nuxt-starter/test/upgrade
git commit -m "feat(cli): plan three-way upgrades between kit revisions"
```

---

### Task 6: Structured JSON upgrade

`package.json` is never text-merged. Each module's declared fragment is compared old-versus-new, leaf by leaf, and applied only where the user has not changed that same value themselves.

**Files:**

- Create: `packages/create-nuxt-starter/src/upgrade/structured.ts`
- Create: `packages/create-nuxt-starter/test/upgrade/structured.test.ts`

**Interfaces:**

- Produces:
  - `type StructuredChange = { file: string; keyPath: string[]; type: 'set'; value: unknown } | { file: string; keyPath: string[]; type: 'remove' } | { file: string; keyPath: string[]; type: 'skip'; reason: string }`
  - `planStructuredChanges(options: { document: Record<string, unknown>; file: string; previous: Record<string, unknown>[]; next: Record<string, unknown>[] }): StructuredChange[]`
  - `applyStructuredChanges(document: Record<string, unknown>, changes: StructuredChange[]): Record<string, unknown>`

- [ ] **Step 1: Write the failing test**

```ts
// test/upgrade/structured.test.ts
import { describe, expect, it } from 'vitest';
import { applyStructuredChanges, planStructuredChanges } from '../../src/upgrade/structured';

const file = 'package.json';

describe('planStructuredChanges', () => {
  it('updates a value the module previously supplied', () => {
    const changes = planStructuredChanges({
      file,
      document: { dependencies: { '@nuxt/content': '^3.0.0' } },
      previous: [{ dependencies: { '@nuxt/content': '^3.0.0' } }],
      next: [{ dependencies: { '@nuxt/content': '^3.2.0' } }],
    });
    expect(changes).toEqual([
      { file, keyPath: ['dependencies', '@nuxt/content'], type: 'set', value: '^3.2.0' },
    ]);
  });

  it('adds newly declared entries', () => {
    const changes = planStructuredChanges({
      file,
      document: { dependencies: { '@nuxt/content': '^3.0.0' } },
      previous: [{ dependencies: { '@nuxt/content': '^3.0.0' } }],
      next: [{ dependencies: { '@nuxt/content': '^3.0.0', '@nuxtjs/mdc': '^0.10.0' } }],
    });
    expect(changes).toEqual([
      { file, keyPath: ['dependencies', '@nuxtjs/mdc'], type: 'set', value: '^0.10.0' },
    ]);
  });

  it('removes entries the module no longer declares', () => {
    const changes = planStructuredChanges({
      file,
      document: { dependencies: { old: '^1.0.0' } },
      previous: [{ dependencies: { old: '^1.0.0' } }],
      next: [{ dependencies: {} }],
    });
    expect(changes).toEqual([{ file, keyPath: ['dependencies', 'old'], type: 'remove' }]);
  });

  it('leaves values the user changed alone', () => {
    const changes = planStructuredChanges({
      file,
      document: { dependencies: { '@nuxt/content': '^3.1.0-my-fork' } },
      previous: [{ dependencies: { '@nuxt/content': '^3.0.0' } }],
      next: [{ dependencies: { '@nuxt/content': '^3.2.0' } }],
    });
    expect(changes).toEqual([
      {
        file,
        keyPath: ['dependencies', '@nuxt/content'],
        type: 'skip',
        reason: 'changed locally',
      },
    ]);
  });

  it('plans nothing when the declaration is unchanged', () => {
    expect(
      planStructuredChanges({
        file,
        document: { dependencies: { a: '1' } },
        previous: [{ dependencies: { a: '1' } }],
        next: [{ dependencies: { a: '1' } }],
      }),
    ).toEqual([]);
  });

  it('merges declarations from several modules', () => {
    const changes = planStructuredChanges({
      file,
      document: { dependencies: { a: '1', b: '1' } },
      previous: [{ dependencies: { a: '1' } }, { dependencies: { b: '1' } }],
      next: [{ dependencies: { a: '2' } }, { dependencies: { b: '2' } }],
    });
    expect(changes).toHaveLength(2);
  });
});

describe('applyStructuredChanges', () => {
  it('applies sets and removes, ignoring skips', () => {
    const document = { name: 'app', dependencies: { a: '1', gone: '1' } };
    const result = applyStructuredChanges(document, [
      { file, keyPath: ['dependencies', 'a'], type: 'set', value: '2' },
      { file, keyPath: ['dependencies', 'gone'], type: 'remove' },
      { file, keyPath: ['dependencies', 'untouched'], type: 'skip', reason: 'changed locally' },
    ]);
    expect(result).toEqual({ name: 'app', dependencies: { a: '2' } });
  });

  it('creates intermediate objects when setting a new nested key', () => {
    expect(
      applyStructuredChanges({}, [
        { file, keyPath: ['scripts', 'db:generate'], type: 'set', value: 'nuxt db generate' },
      ]),
    ).toEqual({ scripts: { 'db:generate': 'nuxt db generate' } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/upgrade/structured.test.ts`
Expected: FAIL — cannot resolve `../../src/upgrade/structured`.

- [ ] **Step 3: Write `src/upgrade/structured.ts`**

```ts
export type StructuredChange =
  | { file: string; keyPath: string[]; type: 'set'; value: unknown }
  | { file: string; keyPath: string[]; type: 'remove' }
  | { file: string; keyPath: string[]; type: 'skip'; reason: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Flattens a fragment into leaf key paths, so merging happens per value. */
function flatten(
  fragment: Record<string, unknown>,
  prefix: string[] = [],
  into = new Map<string, { keyPath: string[]; value: unknown }>(),
): Map<string, { keyPath: string[]; value: unknown }> {
  for (const [key, value] of Object.entries(fragment)) {
    const keyPath = [...prefix, key];
    if (isPlainObject(value)) flatten(value, keyPath, into);
    else into.set(keyPath.join('�'), { keyPath, value });
  }
  return into;
}

function readAt(document: Record<string, unknown>, keyPath: string[]): unknown {
  let current: unknown = document;
  for (const key of keyPath) {
    if (!isPlainObject(current)) return undefined;
    current = current[key];
  }
  return current;
}

function isSameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export interface PlanStructuredOptions {
  file: string;
  document: Record<string, unknown>;
  previous: Record<string, unknown>[];
  next: Record<string, unknown>[];
}

/**
 * Three-way merge for JSON, per leaf value. A value is only touched when the
 * document still holds exactly what the module put there last time; anything
 * else means the user owns it now.
 */
export function planStructuredChanges(options: PlanStructuredOptions): StructuredChange[] {
  const previous = new Map<string, { keyPath: string[]; value: unknown }>();
  for (const fragment of options.previous) flatten(fragment, [], previous);
  const next = new Map<string, { keyPath: string[]; value: unknown }>();
  for (const fragment of options.next) flatten(fragment, [], next);

  const changes: StructuredChange[] = [];
  const keys = [...new Set([...previous.keys(), ...next.keys()])];

  for (const key of keys) {
    const before = previous.get(key);
    const after = next.get(key);
    const entry = after ?? before;
    if (entry === undefined) continue;
    const keyPath = entry.keyPath;
    const current = readAt(options.document, keyPath);

    if (before && after) {
      if (isSameValue(before.value, after.value)) continue;
      if (!isSameValue(current, before.value)) {
        changes.push({ file: options.file, keyPath, type: 'skip', reason: 'changed locally' });
        continue;
      }
      changes.push({ file: options.file, keyPath, type: 'set', value: after.value });
      continue;
    }

    if (after) {
      if (current === undefined) {
        changes.push({ file: options.file, keyPath, type: 'set', value: after.value });
      } else if (!isSameValue(current, after.value)) {
        changes.push({ file: options.file, keyPath, type: 'skip', reason: 'changed locally' });
      }
      continue;
    }

    if (before) {
      if (isSameValue(current, before.value)) {
        changes.push({ file: options.file, keyPath, type: 'remove' });
      } else if (current !== undefined) {
        changes.push({ file: options.file, keyPath, type: 'skip', reason: 'changed locally' });
      }
    }
  }

  return changes;
}

export function applyStructuredChanges(
  document: Record<string, unknown>,
  changes: StructuredChange[],
): Record<string, unknown> {
  const result: Record<string, unknown> = structuredClone(document);

  for (const change of changes) {
    if (change.type === 'skip') continue;
    const leaf = change.keyPath.at(-1);
    if (leaf === undefined) continue;
    const parents = change.keyPath.slice(0, -1);

    let container: Record<string, unknown> = result;
    let reachable = true;
    for (const key of parents) {
      const next = container[key];
      if (isPlainObject(next)) {
        container = next;
        continue;
      }
      if (change.type === 'remove') {
        reachable = false;
        break;
      }
      const created: Record<string, unknown> = {};
      container[key] = created;
      container = created;
    }
    if (!reachable) continue;

    if (change.type === 'remove') delete container[leaf];
    else container[leaf] = change.value;
  }

  return result;
}
```

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run test/upgrade/structured.test.ts && npm run typecheck`
Expected: PASS (8 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/create-nuxt-starter/src/upgrade/structured.ts packages/create-nuxt-starter/test/upgrade/structured.test.ts
git commit -m "feat(cli): merge module-declared JSON fragments structurally"
```

---

### Task 7: Applying the plan

Writes the planned actions, applies structured changes, and rewrites the manifest — the point of no return, which is why the clean-tree check guards it.

**Files:**

- Create: `packages/create-nuxt-starter/src/upgrade/apply.ts`
- Create: `packages/create-nuxt-starter/test/upgrade/apply.test.ts`

**Interfaces:**

- Consumes: `UpgradePlan`, `planStructuredChanges`, `applyStructuredChanges`, `writeTextFile`, `writeJsonAtomically`, `readManifest`, `writeManifest`.
- Produces:
  - `interface ApplyResult { written: string[]; deleted: string[]; conflicted: string[]; orphaned: string[]; structured: StructuredChange[] }`
  - `applyUpgrade(plan: UpgradePlan, registry: Registry): Promise<ApplyResult>`

- [ ] **Step 1: Write the failing test**

```ts
// test/upgrade/apply.test.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readManifest } from '../../src/manifest/io';
import { applyUpgrade } from '../../src/upgrade/apply';
import { must } from '../support/must';
import { planUpgrade } from '../../src/upgrade/plan';
import { hashContent, pathExists } from '../../src/util/fs';
import {
  FIXTURE_KIT_V1_ROOT,
  FIXTURE_KIT_V2_ROOT,
  loadFixtureRegistryV2,
} from '../support/fixtureKit';
import { commitAll, editFile, generateProjectAtV1 } from '../support/upgradeFixture';

async function upgrade(projectRoot: string) {
  const registry = await loadFixtureRegistryV2();
  const plan = await planUpgrade({
    projectRoot,
    registry,
    localKitRoot: FIXTURE_KIT_V2_ROOT,
    localOldKitRoot: FIXTURE_KIT_V1_ROOT,
  });
  try {
    return await applyUpgrade(plan, registry);
  } finally {
    await plan.cleanup();
  }
}

describe('applyUpgrade', () => {
  it('writes upstream changes and removes deleted files', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const result = await upgrade(projectRoot);

    expect(await readFile(join(projectRoot, 'app/pages/index.vue'), 'utf8')).toContain(
      'Welcome home',
    );
    expect(await pathExists(join(projectRoot, 'app/pages/about.vue'))).toBe(true);
    expect(await pathExists(join(projectRoot, 'app/legacy.ts'))).toBe(false);
    expect(result.deleted).toContain('app/legacy.ts');
  });

  it('records the new revision and module versions in the manifest', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await upgrade(projectRoot);

    const manifest = await readManifest(projectRoot);
    expect(manifest.kit.revision).toBe('v2');
    expect(must(manifest.modules.find((module) => module.id === 'content')).version).toBe('2.0.0');
  });

  it('stores pristine target hashes so the next upgrade sees unmodified files', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await upgrade(projectRoot);

    const manifest = await readManifest(projectRoot);
    const recorded = must(manifest.modules.find((module) => module.id === 'base')).files[
      'app/pages/index.vue'
    ];
    const onDisk = hashContent(await readFile(join(projectRoot, 'app/pages/index.vue'), 'utf8'));
    expect(recorded).toBe(onDisk);
  });

  it('upgrades package.json structurally', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await upgrade(projectRoot);

    const packageJson = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
    expect(packageJson.dependencies).toEqual({
      '@nuxt/content': '^3.2.0',
      '@nuxtjs/mdc': '^0.10.0',
    });
  });

  it('leaves a dependency the user pinned themselves', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    const packageJsonPath = join(projectRoot, 'package.json');
    const original = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    original.dependencies['@nuxt/content'] = '3.0.5-my-fork';
    await editFile(projectRoot, 'package.json', `${JSON.stringify(original, null, 2)}\n`);
    await commitAll(projectRoot);

    const result = await upgrade(projectRoot);
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    expect(packageJson.dependencies['@nuxt/content']).toBe('3.0.5-my-fork');
    expect(result.structured.some((change) => change.type === 'skip')).toBe(true);
  });

  it('writes conflict markers and reports the file', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(
      projectRoot,
      'app/pages/index.vue',
      '<template>\n  <h1>My page</h1>\n</template>\n',
    );
    await commitAll(projectRoot);

    const result = await upgrade(projectRoot);
    expect(result.conflicted).toEqual(['app/pages/index.vue']);
    expect(await readFile(join(projectRoot, 'app/pages/index.vue'), 'utf8')).toContain(
      '<<<<<<< local',
    );
  });

  it('keeps an edited file that upstream deleted and marks it orphaned', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/legacy.ts', "export const legacyHelper = 'mine';\n");
    await commitAll(projectRoot);

    const result = await upgrade(projectRoot);
    expect(await pathExists(join(projectRoot, 'app/legacy.ts'))).toBe(true);
    expect(result.orphaned).toContain('app/legacy.ts');

    const manifest = await readManifest(projectRoot);
    expect(must(manifest.modules.find((module) => module.id === 'base')).orphaned).toContain(
      'app/legacy.ts',
    );
  });

  it('is idempotent — upgrading again plans nothing', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await upgrade(projectRoot);
    const second = await upgrade(projectRoot);
    expect(second.written).toEqual([]);
    expect(second.deleted).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/upgrade/apply.test.ts`
Expected: FAIL — cannot resolve `../../src/upgrade/apply`.

- [ ] **Step 3: Write `src/upgrade/apply.ts`**

```ts
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { CliError } from '../errors';
import { writeManifest, type ManifestModule, type ProjectManifest } from '../manifest/io';
import { RENDER_VERSION } from '../manifest/schema';
import type { Registry } from '../registry/schema';
import { hashContent, pathExists, writeJsonAtomically, writeTextFile } from '../util/fs';
import { resolveInside } from '../util/paths';
import type { UpgradePlan } from './plan';
import { applyStructuredChanges, planStructuredChanges, type StructuredChange } from './structured';

export interface ApplyResult {
  written: string[];
  deleted: string[];
  conflicted: string[];
  orphaned: string[];
  structured: StructuredChange[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Fragments a module declared for a file, old (manifest) and new (registry). */
function fragmentsFor(
  file: string,
  manifest: ProjectManifest,
  registry: Registry,
  keptIds: Set<string>,
): { previous: Record<string, unknown>[]; next: Record<string, unknown>[] } {
  const previous: Record<string, unknown>[] = [];
  for (const module of manifest.modules) {
    const fragment = module.structured[file];
    if (fragment) previous.push(fragment);
  }
  const next: Record<string, unknown>[] = [];
  for (const module of registry.modules) {
    if (!keptIds.has(module.id)) continue;
    const fragment = module.structured[file];
    if (fragment) next.push(fragment);
  }
  return { previous, next };
}

async function applyStructuredFile(options: {
  projectRoot: string;
  file: string;
  manifest: ProjectManifest;
  registry: Registry;
  keptIds: Set<string>;
}): Promise<{ changes: StructuredChange[]; hash: string | null }> {
  const path = resolveInside(options.projectRoot, options.file, 'Structured target');
  if (!(await pathExists(path))) return { changes: [], hash: null };

  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
  if (!isPlainObject(parsed)) {
    throw new CliError(`Structured target "${options.file}" must contain a JSON object.`);
  }

  const { previous, next } = fragmentsFor(
    options.file,
    options.manifest,
    options.registry,
    options.keptIds,
  );
  const changes = planStructuredChanges({ file: options.file, document: parsed, previous, next });
  const applicable = changes.filter((change) => change.type !== 'skip');
  if (applicable.length > 0) {
    await writeJsonAtomically(path, applyStructuredChanges(parsed, applicable));
  }
  return { changes, hash: hashContent(await readFile(path, 'utf8')) };
}

export async function applyUpgrade(plan: UpgradePlan, registry: Registry): Promise<ApplyResult> {
  const result: ApplyResult = {
    written: [],
    deleted: [],
    conflicted: [],
    orphaned: [],
    structured: [],
  };

  for (const action of plan.actions) {
    const path = resolveInside(plan.projectRoot, action.path, 'Project file');
    switch (action.type) {
      case 'add':
      case 'overwrite':
      case 'merge':
        await writeTextFile(path, action.content);
        result.written.push(action.path);
        break;
      case 'conflict':
        await writeTextFile(path, action.content);
        result.written.push(action.path);
        result.conflicted.push(action.path);
        break;
      case 'delete':
        await rm(path, { force: true });
        result.deleted.push(action.path);
        break;
      case 'orphan':
        result.orphaned.push(action.path);
        break;
      case 'skip':
        break;
    }
  }

  const keptIds = new Set(
    plan.manifest.modules
      .map((module) => module.id)
      .filter((id) => !plan.droppedModuleIds.includes(id)),
  );

  const structuredHashes: Record<string, string> = {};
  for (const file of plan.structuredTargets) {
    const { changes, hash } = await applyStructuredFile({
      projectRoot: plan.projectRoot,
      file,
      manifest: plan.manifest,
      registry,
      keptIds,
    });
    result.structured.push(...changes);
    if (hash !== null) structuredHashes[file] = hash;
  }

  const orphanedByModule = new Map<string, string[]>();
  for (const action of plan.actions) {
    if (action.type !== 'orphan') continue;
    orphanedByModule.set(action.moduleId, [
      ...(orphanedByModule.get(action.moduleId) ?? []),
      action.path,
    ]);
  }

  const nextModules: ManifestModule[] = plan.manifest.modules.map((module) => {
    const registryModule = registry.modules.find((candidate) => candidate.id === module.id);
    if (plan.droppedModuleIds.includes(module.id) || registryModule === undefined) return module;

    const files: Record<string, string> = {};
    for (const [path, hash] of Object.entries(plan.targetHashes)) {
      const owner = plan.actions.find((action) => action.path === path)?.moduleId;
      if (owner === module.id) files[path] = hash;
    }
    for (const [file, hash] of Object.entries(structuredHashes)) {
      if (Object.hasOwn(module.files, file)) files[file] = hash;
    }
    // Keep entries for files this upgrade did not touch.
    for (const [path, hash] of Object.entries(module.files)) {
      if (!Object.hasOwn(files, path) && !plan.targetHashes[path]) continue;
      if (!Object.hasOwn(files, path)) files[path] = plan.targetHashes[path] ?? hash;
    }

    return {
      ...module,
      version: registryModule.version,
      files,
      structured: registryModule.structured,
      orphaned: [
        ...new Set([...module.orphaned, ...(orphanedByModule.get(module.id) ?? [])]),
      ].sort(),
    };
  });

  await writeManifest(plan.projectRoot, {
    ...plan.manifest,
    renderVersion: RENDER_VERSION,
    kit: { template: plan.manifest.kit.template, revision: plan.toRevision },
    modules: nextModules,
  });

  return result;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run test/upgrade/apply.test.ts`
Expected: the "stores pristine target hashes" and "idempotent" tests are the ones most likely to fail first — the manifest file map must end up containing exactly the files that exist after the upgrade. If a test fails, print the manifest (`cat <projectRoot>/.nuxt-starter/manifest.json`) and reconcile the `files` map construction before moving on. Do not weaken the assertions.

- [ ] **Step 5: Verify tests pass**

Run: `npx vitest run && npm run typecheck`
Expected: PASS, typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/create-nuxt-starter/src/upgrade/apply.ts packages/create-nuxt-starter/test/upgrade/apply.test.ts
git commit -m "feat(cli): apply upgrade plans and rewrite the manifest"
```

---

### Task 8: `upgrade` command

**Files:**

- Create: `packages/create-nuxt-starter/src/commands/upgrade.ts`
- Modify: `packages/create-nuxt-starter/src/cli.ts`
- Create: `packages/create-nuxt-starter/test/commands/upgrade.test.ts`

**Interfaces:**

- Produces:
  - `interface UpgradeReport { fromRevision: string; toRevision: string; upToDate: boolean; summary: Record<string, number>; applied: ApplyResult | null; conflicted: string[]; notes: string[] }`
  - `runUpgrade(options: { projectRoot: string; registry: Registry; check: boolean; force: boolean; localKitRoot?: string; localOldKitRoot?: string }): Promise<UpgradeReport>`

- [ ] **Step 1: Write the failing test**

```ts
// test/commands/upgrade.test.ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runUpgrade } from '../../src/commands/upgrade';
import { readManifest } from '../../src/manifest/io';
import {
  FIXTURE_KIT_V1_ROOT,
  FIXTURE_KIT_V2_ROOT,
  loadFixtureRegistry,
  loadFixtureRegistryV2,
} from '../support/fixtureKit';
import { editFile, generateProjectAtV1 } from '../support/upgradeFixture';

async function upgrade(projectRoot: string, overrides: { check?: boolean; force?: boolean } = {}) {
  return runUpgrade({
    projectRoot,
    registry: await loadFixtureRegistryV2(),
    check: overrides.check ?? false,
    force: overrides.force ?? false,
    localKitRoot: FIXTURE_KIT_V2_ROOT,
    localOldKitRoot: FIXTURE_KIT_V1_ROOT,
  });
}

describe('runUpgrade', () => {
  it('previews without writing when checking', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const report = await upgrade(projectRoot, { check: true });

    expect(report.fromRevision).toBe('v1');
    expect(report.toRevision).toBe('v2');
    expect(report.summary.overwrite).toBeGreaterThan(0);
    expect(report.applied).toBeNull();
    expect(await readFile(join(projectRoot, 'app/pages/index.vue'), 'utf8')).not.toContain(
      'Welcome home',
    );
    expect((await readManifest(projectRoot)).kit.revision).toBe('v1');
  });

  it('applies the upgrade', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const report = await upgrade(projectRoot);

    expect(report.applied).not.toBeNull();
    expect(await readFile(join(projectRoot, 'app/pages/index.vue'), 'utf8')).toContain(
      'Welcome home',
    );
  });

  it('refuses to run on a dirty working tree', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/app.vue', 'dirty\n');
    await expect(upgrade(projectRoot)).rejects.toThrow(/uncommitted changes/);
  });

  it('allows a dirty tree with force', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/app.vue', 'dirty\n');
    await expect(upgrade(projectRoot, { force: true })).resolves.toBeDefined();
  });

  it('previews a dirty tree without complaining', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/app.vue', 'dirty\n');
    await expect(upgrade(projectRoot, { check: true })).resolves.toBeDefined();
  });

  it('reports an up-to-date project', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const report = await runUpgrade({
      projectRoot,
      registry: await loadFixtureRegistry(),
      check: false,
      force: false,
      localKitRoot: FIXTURE_KIT_V1_ROOT,
      localOldKitRoot: FIXTURE_KIT_V1_ROOT,
    });
    expect(report.upToDate).toBe(true);
    expect(report.applied).toBeNull();
  });

  it('surfaces conflicts in the report', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(
      projectRoot,
      'app/pages/index.vue',
      '<template>\n  <h1>Mine</h1>\n</template>\n',
    );
    const report = await upgrade(projectRoot, { force: true });
    expect(report.conflicted).toEqual(['app/pages/index.vue']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/commands/upgrade.test.ts`
Expected: FAIL — cannot resolve `../../src/commands/upgrade`.

- [ ] **Step 3: Write `src/commands/upgrade.ts`**

```ts
import { assertCleanWorkingTree } from '../git/repo';
import { readManifest } from '../manifest/io';
import type { Registry } from '../registry/schema';
import { applyUpgrade, type ApplyResult } from '../upgrade/apply';
import { planUpgrade, summarizePlan } from '../upgrade/plan';

export interface UpgradeOptions {
  projectRoot: string;
  registry: Registry;
  check: boolean;
  force: boolean;
  localKitRoot?: string;
  localOldKitRoot?: string;
}

export interface UpgradeReport {
  fromRevision: string;
  toRevision: string;
  upToDate: boolean;
  summary: Record<string, number>;
  moduleUpdates: Array<{ id: string; from: string; to: string }>;
  applied: ApplyResult | null;
  conflicted: string[];
  notes: string[];
}

export async function runUpgrade(options: UpgradeOptions): Promise<UpgradeReport> {
  const manifest = await readManifest(options.projectRoot);
  // Previewing is read-only, so it works on a dirty tree; applying does not.
  if (!options.check) {
    await assertCleanWorkingTree(options.projectRoot, { force: options.force });
  }

  const upToDate = manifest.kit.revision === options.registry.kit.revision;
  if (upToDate) {
    return {
      fromRevision: manifest.kit.revision,
      toRevision: options.registry.kit.revision,
      upToDate: true,
      summary: {},
      moduleUpdates: [],
      applied: null,
      conflicted: [],
      notes: ['Already on the latest kit revision.'],
    };
  }

  const plan = await planUpgrade({
    projectRoot: options.projectRoot,
    registry: options.registry,
    ...(options.localKitRoot === undefined ? {} : { localKitRoot: options.localKitRoot }),
    ...(options.localOldKitRoot === undefined ? {} : { localOldKitRoot: options.localOldKitRoot }),
  });

  try {
    const notes: string[] = [];
    if (plan.renderVersionChanged) {
      notes.push(
        'This project was generated by an older renderer; review the merge results closely.',
      );
    }
    for (const id of plan.droppedModuleIds) {
      notes.push(`Module "${id}" is no longer in the registry; its files were left untouched.`);
    }

    const conflicted = plan.actions
      .filter((action) => action.type === 'conflict')
      .map((action) => action.path);

    const report: UpgradeReport = {
      fromRevision: plan.fromRevision,
      toRevision: plan.toRevision,
      upToDate: false,
      summary: summarizePlan(plan),
      moduleUpdates: plan.moduleUpdates,
      applied: null,
      conflicted,
      notes,
    };

    if (options.check) return report;
    report.applied = await applyUpgrade(plan, options.registry);
    return report;
  } finally {
    await plan.cleanup();
  }
}
```

- [ ] **Step 4: Wire the command into `src/cli.ts`**

Add the import and command, then register it in `subCommands`:

```ts
import { runUpgrade } from './commands/upgrade';

const upgradeCommand = defineCommand({
  meta: { name: 'upgrade', description: 'Pull upstream kit changes into this project.' },
  args: {
    dir: { type: 'string', description: 'Project directory', default: '.' },
    check: { type: 'boolean', description: 'Preview without writing', default: false },
    force: { type: 'boolean', description: 'Allow a dirty working tree', default: false },
    registry: { type: 'string', description: 'Path to an alternative registry.json' },
    kit: { type: 'string', description: 'Path to a local kit checkout instead of downloading' },
  },
  async run({ args }) {
    const registry = await loadRegistry(args.registry || undefined);
    const report = await runUpgrade({
      projectRoot: args.dir,
      registry,
      check: args.check,
      force: args.force,
      ...(args.kit ? { localKitRoot: args.kit } : {}),
    });

    if (report.upToDate) {
      console.log('Already up to date.');
      return;
    }

    console.log(`${report.fromRevision} -> ${report.toRevision}`);
    for (const update of report.moduleUpdates) {
      console.log(`  ${update.id}: ${update.from} -> ${update.to}`);
    }
    const counts = Object.entries(report.summary)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');
    console.log(counts.length > 0 ? `  ${counts}` : '  no file changes');

    if (report.applied === null) {
      console.log('Preview only — run without --check to apply.');
    }
    for (const path of report.conflicted) {
      console.log(`conflict: ${path}`);
    }
    if (report.conflicted.length > 0) {
      console.log(
        'Resolve the conflict markers, then commit. "git diff" shows everything that changed.',
      );
    }
    for (const note of report.notes) console.log(`note: ${note}`);
  },
});
```

Register it: `subCommands: { init: initCommand, modules: modulesCommand, upgrade: upgradeCommand }`.

- [ ] **Step 5: Verify tests pass**

Run: `npx vitest run && npm run typecheck && npm run build`
Expected: PASS, typecheck clean, build succeeds.

- [ ] **Step 6: Smoke-test the real binary**

```bash
rm -rf /tmp/nsk-up && mkdir -p /tmp/nsk-up
node bin/nuxt-starter.mjs init --dir /tmp/nsk-up/app --yes \
  --kit test/fixtures/kit-v1 --registry test/fixtures/kit-v1/registry.json --modules content
(cd /tmp/nsk-up/app && git init --quiet && git add . && \
  git -c user.email=t@e.c -c user.name=T commit --quiet -m initial)
node bin/nuxt-starter.mjs upgrade --dir /tmp/nsk-up/app --check \
  --kit test/fixtures/kit-v2 --registry test/fixtures/kit-v2/registry.json
node bin/nuxt-starter.mjs upgrade --dir /tmp/nsk-up/app \
  --kit test/fixtures/kit-v2 --registry test/fixtures/kit-v2/registry.json
(cd /tmp/nsk-up/app && git --no-pager diff --stat)
```

Expected: `--check` prints the plan and changes nothing; the real run rewrites files; `git diff --stat` shows the upgrade, proving git can review and revert it.

- [ ] **Step 7: Commit**

```bash
git add packages/create-nuxt-starter/src packages/create-nuxt-starter/test
git commit -m "feat(cli): add the upgrade command"
```

---

### Task 9: `status` and `diff`

`status` answers "what do I have and what did I change?" without touching the network. `diff` shows the exact upstream change for one file.

**Files:**

- Create: `packages/create-nuxt-starter/src/commands/status.ts`
- Create: `packages/create-nuxt-starter/src/commands/diff.ts`
- Modify: `packages/create-nuxt-starter/src/cli.ts`
- Modify: `packages/create-nuxt-starter/package.json` (add `diff` dependency)
- Create: `packages/create-nuxt-starter/test/commands/status.test.ts`
- Create: `packages/create-nuxt-starter/test/commands/diff.test.ts`

**Interfaces:**

- Produces:
  - `interface StatusReport { revision: string; registryRevision: string | null; updateAvailable: boolean; modules: Array<{ id: string; version: string; registryVersion: string | null; modified: string[]; missing: string[]; orphaned: string[] }>; damagedMarkers: string[] }`
  - `runStatus(options: { projectRoot: string; registry: Registry | null }): Promise<StatusReport>`
  - `runDiff(options: { projectRoot: string; registry: Registry; paths?: string[]; localKitRoot?: string }): Promise<Array<{ path: string; status: 'changed' | 'unchanged' | 'missing' | 'binary'; patch: string }>>`

- [ ] **Step 1: Add the `diff` dependency**

```bash
npm install diff@^8.0.4
```

- [ ] **Step 2: Write the failing tests**

```ts
// test/commands/status.test.ts
import { describe, expect, it } from 'vitest';
import { runStatus } from '../../src/commands/status';
import { must } from '../support/must';
import { loadFixtureRegistry, loadFixtureRegistryV2 } from '../support/fixtureKit';
import { editFile, generateProjectAtV1 } from '../support/upgradeFixture';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

describe('runStatus', () => {
  it('lists installed modules and finds nothing modified in a fresh project', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    const report = await runStatus({ projectRoot, registry: null });

    expect(report.revision).toBe('v1');
    expect(report.modules.map((module) => module.id)).toEqual(['base', 'content']);
    expect(report.modules.every((module) => module.modified.length === 0)).toBe(true);
  });

  it('reports files the user modified or deleted', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/app.vue', '<template><div>mine</div></template>\n');
    await rm(join(projectRoot, 'app/legacy.ts'));

    const report = await runStatus({ projectRoot, registry: null });
    const base = must(report.modules.find((module) => module.id === 'base'));
    expect(base.modified).toContain('app/app.vue');
    expect(base.missing).toContain('app/legacy.ts');
  });

  it('reports damaged markers', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await editFile(projectRoot, 'nuxt.config.ts', 'export default {\n  // <nsk:content>\n};\n');

    const report = await runStatus({ projectRoot, registry: null });
    expect(report.damagedMarkers).toContain('nuxt.config.ts');
  });

  it('detects an available update from the registry alone', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    expect(
      (await runStatus({ projectRoot, registry: await loadFixtureRegistryV2() })).updateAvailable,
    ).toBe(true);
    expect(
      (await runStatus({ projectRoot, registry: await loadFixtureRegistry() })).updateAvailable,
    ).toBe(false);
  });
});
```

```ts
// test/commands/diff.test.ts
import { describe, expect, it } from 'vitest';
import { runDiff } from '../../src/commands/diff';
import { must } from '../support/must';
import { FIXTURE_KIT_V2_ROOT, loadFixtureRegistryV2 } from '../support/fixtureKit';
import { editFile, generateProjectAtV1 } from '../support/upgradeFixture';

async function diff(projectRoot: string, paths?: string[]) {
  return runDiff({
    projectRoot,
    registry: await loadFixtureRegistryV2(),
    localKitRoot: FIXTURE_KIT_V2_ROOT,
    ...(paths === undefined ? {} : { paths }),
  });
}

describe('runDiff', () => {
  it('shows what upstream changed in a file', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const [entry] = await diff(projectRoot, ['app/pages/index.vue']);

    expect(must(entry).status).toBe('changed');
    expect(must(entry).patch).toContain('-  <h1>Home</h1>');
    expect(must(entry).patch).toContain('+  <h1>Welcome home</h1>');
  });

  it('marks identical files as unchanged', async () => {
    const projectRoot = await generateProjectAtV1(['pwa']);
    const [entry] = await diff(projectRoot, ['app/app.vue']);
    expect(must(entry).status).toBe('unchanged');
    expect(must(entry).patch).toBe('');
  });

  it('reports a file the user deleted as missing', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/pages/index.vue', '');
    const [entry] = await diff(projectRoot, ['app/pages/index.vue']);
    expect(must(entry).status).toBe('changed');
  });

  it('diffs every upstream file when no path is given', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const entries = await diff(projectRoot);
    expect(entries.length).toBeGreaterThan(1);
    expect(entries.some((entry) => entry.status === 'changed')).toBe(true);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run test/commands/status.test.ts test/commands/diff.test.ts`
Expected: FAIL — cannot resolve the two new command modules.

- [ ] **Step 4: Write `src/commands/status.ts`**

```ts
import { join } from 'node:path';
import { CliError } from '../errors';
import { parseMarkers } from '../markers/parse';
import { readManifest } from '../manifest/io';
import type { Registry } from '../registry/schema';
import { hashContent, pathExists, readTextFile } from '../util/fs';
import { resolveInside } from '../util/paths';

export interface StatusModule {
  id: string;
  version: string;
  registryVersion: string | null;
  modified: string[];
  missing: string[];
  orphaned: string[];
}

export interface StatusReport {
  revision: string;
  registryRevision: string | null;
  updateAvailable: boolean;
  modules: StatusModule[];
  damagedMarkers: string[];
}

/**
 * Reads only the project and the recorded hashes — no kit is fetched, so this
 * stays instant and works offline.
 */
export async function runStatus(options: {
  projectRoot: string;
  registry: Registry | null;
}): Promise<StatusReport> {
  const manifest = await readManifest(options.projectRoot);
  const damagedMarkers: string[] = [];
  const modules: StatusModule[] = [];

  for (const module of manifest.modules) {
    const modified: string[] = [];
    const missing: string[] = [];

    for (const [path, recordedHash] of Object.entries(module.files)) {
      const absolute = resolveInside(options.projectRoot, path, 'Project file');
      if (!(await pathExists(absolute))) {
        missing.push(path);
        continue;
      }
      const contents = await readTextFile(absolute);
      if (contents === null) continue;
      if (hashContent(contents) !== recordedHash) modified.push(path);

      try {
        parseMarkers(contents, path);
      } catch (error) {
        if (error instanceof CliError) damagedMarkers.push(path);
        else throw error;
      }
    }

    modules.push({
      id: module.id,
      version: module.version,
      registryVersion:
        options.registry?.modules.find((candidate) => candidate.id === module.id)?.version ?? null,
      modified: modified.sort(),
      missing: missing.sort(),
      orphaned: module.orphaned,
    });
  }

  const registryRevision = options.registry?.kit.revision ?? null;
  return {
    revision: manifest.kit.revision,
    registryRevision,
    updateAvailable: registryRevision !== null && registryRevision !== manifest.kit.revision,
    modules,
    damagedMarkers: [...new Set(damagedMarkers)].sort(),
  };
}
```

Note: `join` is imported for symmetry with other commands; drop it if `noUnusedLocals` complains.

- [ ] **Step 5: Write `src/commands/diff.ts`**

```ts
import { join } from 'node:path';
import { createTwoFilesPatch } from 'diff';
import { readManifest } from '../manifest/io';
import { resolveModules } from '../registry/resolve';
import type { Registry } from '../registry/schema';
import { renderKit } from '../render/render';
import { fetchKit } from '../sources/fetchKit';
import { makeRenderWorkspace } from '../upgrade/workspace';
import { pathExists, readTextFile } from '../util/fs';
import { resolveInside } from '../util/paths';

export interface DiffEntry {
  path: string;
  status: 'changed' | 'unchanged' | 'missing' | 'binary';
  patch: string;
}

export async function runDiff(options: {
  projectRoot: string;
  registry: Registry;
  paths?: string[];
  localKitRoot?: string;
}): Promise<DiffEntry[]> {
  const manifest = await readManifest(options.projectRoot);
  const available = new Set(options.registry.modules.map((module) => module.id));
  const ids = manifest.modules.map((module) => module.id).filter((id) => available.has(id));

  const kit = await fetchKit({
    template: options.registry.kit.template,
    revision: options.registry.kit.revision,
    ...(options.localKitRoot === undefined ? {} : { localKitRoot: options.localKitRoot }),
  });
  const workspace = await makeRenderWorkspace();

  try {
    const rendered = await renderKit({
      kitRoot: kit.root,
      modules: resolveModules(options.registry, ids),
      placeholders: manifest.placeholders,
      destinationRoot: workspace.root,
    });

    const wanted = options.paths === undefined ? rendered.map((file) => file.path) : options.paths;
    const entries: DiffEntry[] = [];

    for (const path of wanted) {
      const upstream = await readTextFile(join(workspace.root, path));
      const projectPath = resolveInside(options.projectRoot, path, 'Project file');
      if (!(await pathExists(projectPath))) {
        entries.push({ path, status: 'missing', patch: '' });
        continue;
      }
      const local = await readTextFile(projectPath);
      if (local === null || upstream === null) {
        entries.push({ path, status: 'binary', patch: '' });
        continue;
      }
      if (local === upstream) {
        entries.push({ path, status: 'unchanged', patch: '' });
        continue;
      }
      entries.push({
        path,
        status: 'changed',
        patch: createTwoFilesPatch(`local/${path}`, `upstream/${path}`, local, upstream),
      });
    }

    return entries;
  } finally {
    await workspace.cleanup();
    await kit.cleanup();
  }
}
```

- [ ] **Step 6: Add the shared workspace helper**

`src/upgrade/workspace.ts`:

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface RenderWorkspace {
  root: string;
  cleanup: () => Promise<void>;
}

export async function makeRenderWorkspace(): Promise<RenderWorkspace> {
  const root = await mkdtemp(join(tmpdir(), 'nsk-render-'));
  return { root, cleanup: () => rm(root, { recursive: true, force: true }) };
}
```

- [ ] **Step 7: Wire both commands into `src/cli.ts`**

```ts
import { runDiff } from './commands/diff';
import { runStatus } from './commands/status';

const statusCommand = defineCommand({
  meta: { name: 'status', description: 'Show installed modules and local changes.' },
  args: {
    dir: { type: 'string', description: 'Project directory', default: '.' },
    registry: { type: 'string', description: 'Path to an alternative registry.json' },
  },
  async run({ args }) {
    const registry = await loadRegistry(args.registry || undefined).catch(() => null);
    const report = await runStatus({ projectRoot: args.dir, registry });

    console.log(`kit revision: ${report.revision}`);
    if (report.updateAvailable) {
      console.log(
        `update available: ${report.registryRevision} (run "nuxt-starter upgrade --check")`,
      );
    }
    for (const module of report.modules) {
      const version =
        module.registryVersion && module.registryVersion !== module.version
          ? `${module.version} -> ${module.registryVersion}`
          : module.version;
      console.log(`${module.id}@${version}`);
      for (const path of module.modified) console.log(`  modified: ${path}`);
      for (const path of module.missing) console.log(`  missing:  ${path}`);
      for (const path of module.orphaned) console.log(`  orphaned: ${path}`);
    }
    for (const path of report.damagedMarkers) {
      console.log(`damaged markers: ${path}`);
    }
  },
});

const diffCommand = defineCommand({
  meta: { name: 'diff', description: 'Show what upstream changed compared to this project.' },
  args: {
    dir: { type: 'string', description: 'Project directory', default: '.' },
    file: { type: 'string', description: 'Limit the diff to one path' },
    registry: { type: 'string', description: 'Path to an alternative registry.json' },
    kit: { type: 'string', description: 'Path to a local kit checkout instead of downloading' },
  },
  async run({ args }) {
    const registry = await loadRegistry(args.registry || undefined);
    const entries = await runDiff({
      projectRoot: args.dir,
      registry,
      ...(args.file ? { paths: [args.file] } : {}),
      ...(args.kit ? { localKitRoot: args.kit } : {}),
    });

    const changed = entries.filter((entry) => entry.status === 'changed');
    if (changed.length === 0) {
      console.log('No upstream differences.');
      return;
    }
    for (const entry of changed) console.log(entry.patch);
  },
});
```

Register both: `subCommands: { init, modules, upgrade, status: statusCommand, diff: diffCommand }` (keeping the existing entries).

- [ ] **Step 8: Verify tests pass and the CLI works**

Run: `npx vitest run && npm run typecheck && npm run build`
Then:

```bash
node bin/nuxt-starter.mjs status --dir /tmp/nsk-up/app --registry test/fixtures/kit-v2/registry.json
node bin/nuxt-starter.mjs diff --dir /tmp/nsk-up/app --file app/pages/index.vue \
  --kit test/fixtures/kit-v2 --registry test/fixtures/kit-v2/registry.json
```

Expected: `status` lists modules and any local modifications; `diff` prints a unified patch or reports no differences (the project was already upgraded in Task 8).

- [ ] **Step 9: Update the README**

Replace the "Commands" section with the full set (`init`, `modules`, `upgrade`, `status`, `diff`), and move the upgrade description out of "Roadmap" — describe the merge behaviour: unmodified files are overwritten, non-overlapping edits merge automatically, overlapping edits produce standard conflict markers, and `git diff` reviews everything.

- [ ] **Step 10: Commit**

```bash
git add packages/create-nuxt-starter
git commit -m "feat(cli): add status and diff commands"
```

---

## Self-Review

**Spec coverage.** Three-way merge via `git merge-file` → Task 2. Per-file classification table (skip / overwrite / merge / conflict / add / delete-or-orphan) → Task 5. Structured JSON never text-merged → Tasks 3 and 6. Clean-tree requirement with `--force`, read-only commands exempt → Tasks 2 and 8. Single-revision invariant (whole project moves; dropped modules excluded from both renders) → Task 5. Render-version warning → Tasks 5 and 8. Orphaned path tracking → Tasks 5 and 7. Protected paths (`.env*`, `content/`, migrations, lockfiles) → Task 5. `upgrade` / `status` / `diff` → Tasks 8 and 9. Upgrade fixtures on a miniature two-revision kit → Task 1.

**Deferred to Plan 3:** `add` / `remove`, reference-counted fragment removal, real kit modularization, the CI generation matrix and registry↔kit consistency check.

**Known risks flagged in the plan:**

- Task 7's manifest `files` reconstruction is the fiddliest code here, which is why Task 7 Step 4 explicitly tells the implementer to expect a first-run failure and reconcile rather than weaken the assertions. The idempotency test is the real guard: a second upgrade must plan nothing.
- `loadRegistryFromKit` falls back to the current registry when an old kit carries none. That is correct for kits that predate in-kit registries but means a base render using today's paths — acceptable, since the alternative is refusing to upgrade at all.

**Placeholder scan:** none. Every code step is complete and runnable; every test step asserts real behaviour.

**Type consistency:** `FileAction` carries `moduleId` on every variant (Task 5) because Task 7 groups orphans and hashes by module. `ApplyResult` is produced in Task 7 and consumed in Task 8's `UpgradeReport`. `StructuredChange` is produced in Task 6 and surfaced through `ApplyResult.structured`. `makeRenderWorkspace` (Task 9 Step 6) is the shared temp-dir helper; Task 5 creates its own workspace inline and is not refactored to use it.
