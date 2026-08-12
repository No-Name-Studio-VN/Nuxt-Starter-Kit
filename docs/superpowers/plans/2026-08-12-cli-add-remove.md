# Modular CLI — Plan 3: Adding and Removing Modules

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `nuxt-starter add <module>` and `nuxt-starter remove <module>` change which modules a project has, merging the change into files the user has edited — the same guarantee `upgrade` gives.

**Architecture:** A key realisation while designing this: adding and removing a module is the _same operation_ as upgrading, with a different pair of endpoints. Upgrading renders `(revision A, modules M)` and `(revision B, modules M)`; adding renders `(revision R, M)` and `(revision R, M + new)`; removing renders `(revision R, M)` and `(revision R, M − old)`. All three then three-way merge the render pair against the project. So Plan 2's planner is generalised into a _transition_ planner and the three commands become thin wrappers. Reference-counted fragments fall out for free: a shared `package.json` key still declared by a surviving module simply stays in the target fragment set, so the leaf merge never removes it.

**Tech Stack:** Unchanged from Plan 2.

**Spec:** `docs/superpowers/specs/2026-08-12-modular-cli-design.md`
**Builds on:** Plans 1 and 2 (both complete)

## Phase split

**Phase A (this plan, executable now):** the transition planner refactor, `add`, and `remove`. Entirely inside `packages/create-nuxt-starter`, verified against the fixture kits.

**Phase B (blocked — needs a clean working tree):** annotating the real kit with `<nsk:…>` markers, authoring the real multi-module registry, and the CI generation matrix plus registry↔kit consistency check. Every file Phase B must edit (`nuxt.config.ts`, `content.config.ts`, `package.json`, `wrangler.jsonc`, `app/assets/css/*`) currently has uncommitted changes, so annotating them now would tangle two unrelated diffs. Phase B starts once those files are committed or stashed.

## Global Constraints

- Everything from Plans 1 and 2 still applies, including the CLAUDE.MD rules: no `any`, no type assertions, no non-null assertions, `must()` in tests, and no hand-run linters or formatters.
- **Single-revision invariant.** `add` and `remove` operate at the project's current revision and refuse to run when the registry has moved on; the user upgrades first.
- `add` and `remove` require a clean git working tree (`--force` overrides), and support `--check` to preview.
- Removing a module that other installed modules require is refused, with the dependents named.

---

### Task 1: Generalise the planner into a transition planner

**Files:**

- Modify: `packages/create-nuxt-starter/src/upgrade/plan.ts`
- Modify: `packages/create-nuxt-starter/test/upgrade/plan.test.ts`
- Create: `packages/create-nuxt-starter/test/upgrade/transition.test.ts`

**Interfaces:**

- Produces:
  - `interface TransitionEndpoint { revision: string; moduleIds: string[] }`
  - `planTransition(options: { projectRoot: string; registry: Registry; from: TransitionEndpoint; to: TransitionEndpoint; resolveLocalKit?: (revision: string) => string | undefined }): Promise<UpgradePlan>`
  - `planUpgrade` keeps its current signature and becomes a wrapper that reads the manifest and calls `planTransition` with the same module set on both endpoints.
- The `UpgradePlan` shape is unchanged, so `applyUpgrade` and `runUpgrade` keep working untouched.

- [ ] **Step 1: Write the failing test**

```ts
// test/upgrade/transition.test.ts
import { describe, expect, it } from 'vitest';
import { readManifest } from '../../src/manifest/io';
import { planTransition } from '../../src/upgrade/plan';
import { loadFixtureRegistry } from '../support/fixtureKit';
import { generateProjectAtV1, resolveFixtureKit } from '../support/upgradeFixture';

describe('planTransition', () => {
  it("adds a module's files without changing revision", async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const manifest = await readManifest(projectRoot);
    const plan = await planTransition({
      projectRoot,
      registry: await loadFixtureRegistry(),
      from: { revision: manifest.kit.revision, moduleIds: ['base'] },
      to: { revision: manifest.kit.revision, moduleIds: ['base', 'pwa'] },
      resolveLocalKit: resolveFixtureKit,
    });

    const added = plan.actions
      .filter((action) => action.type === 'add')
      .map((action) => action.path);
    expect(added).toContain('app/components/InstallPrompter.vue');
    expect(plan.actions.filter((action) => action.type === 'delete')).toEqual([]);
    await plan.cleanup();
  });

  it("removes a module's files without changing revision", async () => {
    const projectRoot = await generateProjectAtV1(['pwa']);
    const manifest = await readManifest(projectRoot);
    const plan = await planTransition({
      projectRoot,
      registry: await loadFixtureRegistry(),
      from: { revision: manifest.kit.revision, moduleIds: ['base', 'pwa'] },
      to: { revision: manifest.kit.revision, moduleIds: ['base'] },
      resolveLocalKit: resolveFixtureKit,
    });

    const deleted = plan.actions
      .filter((action) => action.type === 'delete')
      .map((action) => action.path);
    expect(deleted).toContain('app/components/InstallPrompter.vue');
    await plan.cleanup();
  });

  it('merges a marker block into a file the user edited', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const manifest = await readManifest(projectRoot);
    const plan = await planTransition({
      projectRoot,
      registry: await loadFixtureRegistry(),
      from: { revision: manifest.kit.revision, moduleIds: ['base'] },
      to: { revision: manifest.kit.revision, moduleIds: ['base', 'content'] },
      resolveLocalKit: resolveFixtureKit,
    });

    const config = plan.actions.find((action) => action.path === 'nuxt.config.ts');
    expect(config?.type).toBe('overwrite');
    if (config?.type !== 'overwrite') return;
    expect(config.content).toContain('@nuxt/content');
    await plan.cleanup();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/upgrade/transition.test.ts`
Expected: FAIL — `planTransition` is not exported.

- [ ] **Step 3: Refactor `plan.ts`**

Rename the existing `planUpgrade` body to `planTransition`, taking `from` / `to` endpoints instead of deriving them from the manifest and registry. Inside it:

- `oldKit` is fetched at `from.revision`, `newKit` at `to.revision`.
- The base render uses `from.moduleIds` resolved against the registry recovered from `oldKit`; the target render uses `to.moduleIds` resolved against `registry`.
- `droppedModuleIds` becomes `from.moduleIds` that are neither in `to.moduleIds` nor in the registry; `addedModuleIds` becomes resolved `to` module ids absent from the manifest.
- `fromRevision` / `toRevision` come from the endpoints.

Then add the wrapper:

```ts
export async function planUpgrade(options: PlanUpgradeOptions): Promise<UpgradePlan> {
  const manifest = await readManifest(options.projectRoot);
  const available = new Set(options.registry.modules.map((module) => module.id));
  const installedIds = manifest.modules.map((module) => module.id);

  return planTransition({
    projectRoot: options.projectRoot,
    registry: options.registry,
    from: { revision: manifest.kit.revision, moduleIds: installedIds },
    to: {
      revision: options.registry.kit.revision,
      moduleIds: installedIds.filter((id) => available.has(id)),
    },
    ...(options.resolveLocalKit === undefined ? {} : { resolveLocalKit: options.resolveLocalKit }),
  });
}
```

- [ ] **Step 4: Verify the whole suite still passes**

Run: `npx vitest run && npm run typecheck`
Expected: every Plan 2 test still passes — the refactor must not change upgrade behaviour — plus the three new transition tests.

- [ ] **Step 5: Commit**

```bash
git add packages/create-nuxt-starter
git commit -m "refactor(cli): generalise the planner into a module-set transition"
```

---

### Task 2: `add` command

**Files:**

- Create: `packages/create-nuxt-starter/src/commands/add.ts`
- Create: `packages/create-nuxt-starter/test/commands/add.test.ts`
- Modify: `packages/create-nuxt-starter/src/cli.ts`

**Interfaces:**

- Produces:
  - `interface ChangeReport { moduleIds: string[]; summary: Record<ActionType, number>; applied: ApplyResult | null; conflicted: string[]; notes: string[]; env: string[] }`
  - `runAdd(options: { projectRoot: string; registry: Registry; moduleIds: string[]; check: boolean; force: boolean; resolveLocalKit?: (revision: string) => string | undefined }): Promise<ChangeReport>`

- [ ] **Step 1: Write the failing test**

```ts
// test/commands/add.test.ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAdd } from '../../src/commands/add';
import { readManifest } from '../../src/manifest/io';
import { pathExists } from '../../src/util/fs';
import { loadFixtureRegistry, loadFixtureRegistryV2 } from '../support/fixtureKit';
import { must } from '../support/must';
import { generateProjectAtV1, resolveFixtureKit } from '../support/upgradeFixture';

async function add(projectRoot: string, moduleIds: string[], check = false) {
  return runAdd({
    projectRoot,
    registry: await loadFixtureRegistry(),
    moduleIds,
    check,
    force: false,
    resolveLocalKit: resolveFixtureKit,
  });
}

describe('runAdd', () => {
  it('installs a module and its files', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const report = await add(projectRoot, ['pwa']);

    expect(report.moduleIds).toEqual(['pwa']);
    expect(await pathExists(join(projectRoot, 'app/components/InstallPrompter.vue'))).toBe(true);
    const manifest = await readManifest(projectRoot);
    expect(manifest.modules.map((module) => module.id)).toContain('pwa');
  });

  it("adds the module's package.json entries", async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await add(projectRoot, ['content']);
    const manifest = await readManifest(projectRoot);
    expect(
      must(manifest.modules.find((module) => module.id === 'content')).structured,
    ).toHaveProperty('package.json');
  });

  it('pulls in dependencies automatically', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const report = await add(projectRoot, ['content']);
    expect(report.moduleIds).toContain('content');
  });

  it('reports module notes and env vars', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const report = await add(projectRoot, ['pwa']);
    expect(report.notes).toContain('Generate PWA icons before deploying.');
  });

  it('is a no-op when the module is already installed', async () => {
    const projectRoot = await generateProjectAtV1(['pwa']);
    const report = await add(projectRoot, ['pwa']);
    expect(report.moduleIds).toEqual([]);
    expect(report.applied).toBeNull();
  });

  it('previews without writing', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const report = await add(projectRoot, ['pwa'], true);
    expect(report.applied).toBeNull();
    expect(await pathExists(join(projectRoot, 'app/components/InstallPrompter.vue'))).toBe(false);
  });

  it('refuses an unknown module', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await expect(add(projectRoot, ['nope'])).rejects.toThrow(/Unknown module/);
  });

  it('refuses when the registry has moved to a newer revision', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await expect(
      runAdd({
        projectRoot,
        registry: await loadFixtureRegistryV2(),
        moduleIds: ['pwa'],
        check: false,
        force: false,
        resolveLocalKit: resolveFixtureKit,
      }),
    ).rejects.toThrow(/upgrade/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/commands/add.test.ts`
Expected: FAIL — cannot resolve `../../src/commands/add`.

- [ ] **Step 3: Write `src/commands/add.ts`**

```ts
import { CliError } from '../errors';
import { assertCleanWorkingTree } from '../git/repo';
import { readManifest } from '../manifest/io';
import { resolveModules } from '../registry/resolve';
import { getModule, type Registry } from '../registry/schema';
import type { ApplyResult } from '../upgrade/apply';
import { applyUpgrade } from '../upgrade/apply';
import type { ActionType } from '../upgrade/plan';
import { planTransition, summarizePlan } from '../upgrade/plan';

export interface ChangeReport {
  moduleIds: string[];
  summary: Record<ActionType, number>;
  applied: ApplyResult | null;
  conflicted: string[];
  notes: string[];
  env: string[];
}

export interface AddOptions {
  projectRoot: string;
  registry: Registry;
  moduleIds: string[];
  check: boolean;
  force: boolean;
  resolveLocalKit?: (revision: string) => string | undefined;
}

const EMPTY_SUMMARY: Record<ActionType, number> = {
  skip: 0,
  add: 0,
  overwrite: 0,
  merge: 0,
  conflict: 0,
  delete: 0,
  orphan: 0,
};

export async function runAdd(options: AddOptions): Promise<ChangeReport> {
  const manifest = await readManifest(options.projectRoot);

  // Adding at an older revision would render a module set no CI run has built.
  if (manifest.kit.revision !== options.registry.kit.revision) {
    throw new CliError(
      `This project is on kit revision ${manifest.kit.revision} but the registry is on ${options.registry.kit.revision}. Run "nuxt-starter upgrade" first, then add.`,
    );
  }

  for (const id of options.moduleIds) getModule(options.registry, id);

  const installedIds = manifest.modules.map((module) => module.id);
  const requested = resolveModules(options.registry, [...installedIds, ...options.moduleIds]);
  const addedIds = requested.map((module) => module.id).filter((id) => !installedIds.includes(id));

  if (addedIds.length === 0) {
    return {
      moduleIds: [],
      summary: EMPTY_SUMMARY,
      applied: null,
      conflicted: [],
      notes: ['Nothing to add — every requested module is already installed.'],
      env: [],
    };
  }

  if (!options.check) {
    await assertCleanWorkingTree(options.projectRoot, { force: options.force });
  }

  const plan = await planTransition({
    projectRoot: options.projectRoot,
    registry: options.registry,
    from: { revision: manifest.kit.revision, moduleIds: installedIds },
    to: { revision: manifest.kit.revision, moduleIds: requested.map((module) => module.id) },
    ...(options.resolveLocalKit === undefined ? {} : { resolveLocalKit: options.resolveLocalKit }),
  });

  try {
    const added = requested.filter((module) => addedIds.includes(module.id));
    const report: ChangeReport = {
      moduleIds: addedIds,
      summary: summarizePlan(plan),
      applied: null,
      conflicted: plan.actions
        .filter((action) => action.type === 'conflict')
        .map((action) => action.path),
      notes: added.flatMap((module) => module.notes),
      env: [...new Set(added.flatMap((module) => module.env))],
    };

    if (options.check) return report;
    report.applied = await applyUpgrade(plan, options.registry);
    return report;
  } finally {
    await plan.cleanup();
  }
}
```

- [ ] **Step 4: Wire it into `src/cli.ts`**

```ts
const addCommand = defineCommand({
  meta: { name: 'add', description: 'Install modules into this project.' },
  args: {
    modules: { type: 'positional', required: true, description: 'Comma-separated module ids' },
    dir: { type: 'string', description: 'Project directory', default: '.' },
    check: { type: 'boolean', description: 'Preview without writing', default: false },
    force: { type: 'boolean', description: 'Allow a dirty working tree', default: false },
    registry: { type: 'string', description: 'Path to an alternative registry.json' },
    kit: { type: 'string', description: 'Path to a local kit checkout instead of downloading' },
  },
  async run({ args }) {
    const registry = await loadRegistry(args.registry || undefined);
    const report = await runAdd({
      projectRoot: args.dir,
      registry,
      moduleIds: args.modules
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
      check: args.check,
      force: args.force,
      resolveLocalKit: () => args.kit || undefined,
    });
    reportChange('Added', report);
  },
});
```

with a shared printer used by both `add` and `remove`:

```ts
function reportChange(verb: string, report: ChangeReport): void {
  if (report.moduleIds.length === 0) {
    for (const note of report.notes) console.log(note);
    return;
  }
  console.log(`${verb}: ${report.moduleIds.join(', ')}`);
  const counts = Object.entries(report.summary)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${count} ${type}`)
    .join(', ');
  if (counts.length > 0) console.log(`  ${counts}`);
  if (report.applied === null) console.log('Preview only — run without --check to apply.');
  for (const path of report.conflicted) console.log(`conflict: ${path}`);
  for (const note of report.notes) console.log(`note: ${note}`);
  if (report.env.length > 0) {
    console.log(`Set these environment variables: ${report.env.join(', ')}`);
  }
}
```

Register `add` in `subCommands`.

- [ ] **Step 5: Verify**

Run: `npx vitest run && npm run typecheck && npm run build`

- [ ] **Step 6: Commit**

```bash
git add packages/create-nuxt-starter
git commit -m "feat(cli): add the add command"
```

---

### Task 3: `remove` command

**Files:**

- Create: `packages/create-nuxt-starter/src/commands/remove.ts`
- Create: `packages/create-nuxt-starter/test/commands/remove.test.ts`
- Modify: `packages/create-nuxt-starter/src/cli.ts`

**Interfaces:**

- Produces: `runRemove(options: { projectRoot; registry; moduleIds; check; force; resolveLocalKit? }): Promise<ChangeReport>`, reusing `ChangeReport` from `add.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// test/commands/remove.test.ts
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runRemove } from '../../src/commands/remove';
import { readManifest } from '../../src/manifest/io';
import { pathExists, readTextFile } from '../../src/util/fs';
import { loadFixtureRegistry } from '../support/fixtureKit';
import {
  editFile,
  commitAll,
  generateProjectAtV1,
  resolveFixtureKit,
} from '../support/upgradeFixture';

async function remove(projectRoot: string, moduleIds: string[], check = false) {
  return runRemove({
    projectRoot,
    registry: await loadFixtureRegistry(),
    moduleIds,
    check,
    force: false,
    resolveLocalKit: resolveFixtureKit,
  });
}

describe('runRemove', () => {
  it("deletes the module's files and manifest entry", async () => {
    const projectRoot = await generateProjectAtV1(['pwa']);
    const report = await remove(projectRoot, ['pwa']);

    expect(report.moduleIds).toEqual(['pwa']);
    expect(await pathExists(join(projectRoot, 'app/components/InstallPrompter.vue'))).toBe(false);
    const manifest = await readManifest(projectRoot);
    expect(manifest.modules.map((module) => module.id)).not.toContain('pwa');
  });

  it("strips the module's marker block from shared files", async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await remove(projectRoot, ['content']);
    const config = await readTextFile(join(projectRoot, 'nuxt.config.ts'));
    expect(config).not.toContain('@nuxt/content');
    expect(config).not.toContain('<nsk:content>');
  });

  it('keeps a file the user edited, as an orphan', async () => {
    const projectRoot = await generateProjectAtV1(['pwa']);
    await editFile(
      projectRoot,
      'app/components/InstallPrompter.vue',
      '<template>mine</template>\n',
    );
    await commitAll(projectRoot);

    const report = await remove(projectRoot, ['pwa']);
    expect(await pathExists(join(projectRoot, 'app/components/InstallPrompter.vue'))).toBe(true);
    expect(report.applied?.orphaned).toContain('app/components/InstallPrompter.vue');
  });

  it('refuses to remove a module other modules require', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await expect(remove(projectRoot, ['base'])).rejects.toThrow(/content/);
  });

  it('refuses a module that is not installed', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await expect(remove(projectRoot, ['pwa'])).rejects.toThrow(/not installed/);
  });

  it('previews without writing', async () => {
    const projectRoot = await generateProjectAtV1(['pwa']);
    const report = await remove(projectRoot, ['pwa'], true);
    expect(report.applied).toBeNull();
    expect(await pathExists(join(projectRoot, 'app/components/InstallPrompter.vue'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/commands/remove.test.ts`
Expected: FAIL — cannot resolve `../../src/commands/remove`.

- [ ] **Step 3: Write `src/commands/remove.ts`**

```ts
import { CliError } from '../errors';
import { assertCleanWorkingTree } from '../git/repo';
import { readManifest } from '../manifest/io';
import { getModule, type Registry } from '../registry/schema';
import { applyUpgrade } from '../upgrade/apply';
import { planTransition, summarizePlan } from '../upgrade/plan';
import type { ChangeReport } from './add';

export interface RemoveOptions {
  projectRoot: string;
  registry: Registry;
  moduleIds: string[];
  check: boolean;
  force: boolean;
  resolveLocalKit?: (revision: string) => string | undefined;
}

export async function runRemove(options: RemoveOptions): Promise<ChangeReport> {
  const manifest = await readManifest(options.projectRoot);
  const installedIds = manifest.modules.map((module) => module.id);

  for (const id of options.moduleIds) {
    if (!installedIds.includes(id)) {
      throw new CliError(`Module "${id}" is not installed in this project.`);
    }
  }

  const remainingIds = installedIds.filter((id) => !options.moduleIds.includes(id));

  // Removing something another module needs would leave the project unbuildable.
  for (const id of remainingIds) {
    const module = getModule(options.registry, id);
    const broken = module.requires.filter((required) => options.moduleIds.includes(required));
    if (broken.length > 0) {
      throw new CliError(
        `Cannot remove ${broken.join(', ')}: module "${id}" requires ${broken.length > 1 ? 'them' : 'it'}. Remove "${id}" first.`,
      );
    }
  }

  if (!options.check) {
    await assertCleanWorkingTree(options.projectRoot, { force: options.force });
  }

  const plan = await planTransition({
    projectRoot: options.projectRoot,
    registry: options.registry,
    from: { revision: manifest.kit.revision, moduleIds: installedIds },
    to: { revision: manifest.kit.revision, moduleIds: remainingIds },
    ...(options.resolveLocalKit === undefined ? {} : { resolveLocalKit: options.resolveLocalKit }),
  });

  try {
    const report: ChangeReport = {
      moduleIds: options.moduleIds,
      summary: summarizePlan(plan),
      applied: null,
      conflicted: plan.actions
        .filter((action) => action.type === 'conflict')
        .map((action) => action.path),
      notes: [],
      env: [],
    };

    if (options.check) return report;
    report.applied = await applyUpgrade(plan, options.registry);
    return report;
  } finally {
    await plan.cleanup();
  }
}
```

Note: `applyUpgrade` must drop manifest entries for removed modules. Extend it to skip modules absent from the plan's target module set — see Task 4.

- [ ] **Step 4: Wire `remove` into `src/cli.ts`** mirroring `add`, using the shared `reportChange('Removed', report)` printer.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run && npm run typecheck && npm run build
git add packages/create-nuxt-starter
git commit -m "feat(cli): add the remove command"
```

---

### Task 4: Drop removed modules from the manifest

`applyUpgrade` currently keeps every manifest module. A removal has to delete the entry, or `status` would keep listing a module whose files are gone.

**Files:**

- Modify: `packages/create-nuxt-starter/src/upgrade/apply.ts`
- Modify: `packages/create-nuxt-starter/src/upgrade/plan.ts` (expose the target module ids)

**Interfaces:**

- Produces: `UpgradePlan` gains `targetModuleIds: string[]`; `applyUpgrade` writes only modules in that list, plus modules dropped from the registry (which are preserved untouched, per the spec).

- [ ] **Step 1: Write the failing test (append to `test/commands/remove.test.ts`)**

```ts
it('leaves other modules intact', async () => {
  const projectRoot = await generateProjectAtV1(['content']);
  await remove(projectRoot, ['content']);
  const manifest = await readManifest(projectRoot);
  expect(manifest.modules.map((module) => module.id)).toEqual(['base']);
  expect(await pathExists(join(projectRoot, 'app/app.vue'))).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/commands/remove.test.ts -t "leaves other modules intact"`
Expected: FAIL — the manifest still lists `content`.

- [ ] **Step 3: Implement**

In `planTransition`, record `targetModuleIds` from the resolved target modules. In `applyUpgrade`, build `existingModules` by filtering `plan.manifest.modules` to those in `plan.targetModuleIds` or in `plan.droppedModuleIds` (registry-dropped modules keep their entry so their files stay accounted for).

- [ ] **Step 4: Verify and commit**

```bash
npx vitest run && npm run typecheck
git add packages/create-nuxt-starter
git commit -m "fix(cli): drop removed modules from the manifest"
```

---

### Task 5: README and end-to-end smoke test

- [ ] **Step 1: Smoke-test both commands against the fixture kit**

```bash
rm -rf /tmp/nsk-ar && node bin/nuxt-starter.mjs init --dir /tmp/nsk-ar --yes \
  --kit test/fixtures/kit-v1 --registry test/fixtures/kit-v1/registry.json --modules base
(cd /tmp/nsk-ar && git init --quiet && git add . && \
  git -c user.email=t@e.c -c user.name=T commit --quiet -m initial)
node bin/nuxt-starter.mjs add content --dir /tmp/nsk-ar \
  --kit test/fixtures/kit-v1 --registry test/fixtures/kit-v1/registry.json
grep -q '@nuxt/content' /tmp/nsk-ar/nuxt.config.ts && echo "block inserted"
(cd /tmp/nsk-ar && git add . && git -c user.email=t@e.c -c user.name=T commit --quiet -m add)
node bin/nuxt-starter.mjs remove content --dir /tmp/nsk-ar \
  --kit test/fixtures/kit-v1 --registry test/fixtures/kit-v1/registry.json
grep -q '@nuxt/content' /tmp/nsk-ar/nuxt.config.ts || echo "block removed"
```

Expected: adding inserts the content block and `content.config.ts`; removing strips both again.

- [ ] **Step 2: Update the README** — document `add` and `remove` in the command list, noting that both merge into edited files and that removal keeps files you have modified, flagging them as orphans.

- [ ] **Step 3: Commit**

```bash
git add packages/create-nuxt-starter
git commit -m "docs(cli): document add and remove"
```

---

## Phase B (blocked, for a later session)

Requires the kit's own config files to be free of unrelated uncommitted changes:

1. **Annotate the kit** — wrap module-owned fragments in `nuxt.config.ts`, `content.config.ts`, `app.config.ts`, and the global CSS with `<nsk:…>` markers.
2. **Author the real registry** — assign every kit path to `base`, `pwa`, `content`, `database`, `auth`, `admin-users`, or `kit-extras`, with each module's `structured` entries for `package.json` and `wrangler.jsonc`.
3. **CI generation matrix** — generate `{base}`, `{base,pwa}`, `{base,content}`, `{base,database,auth}`, and all-modules projects, then `nuxt typecheck` and build each. This is the guard against undeclared coupling.
4. **Registry↔kit consistency check** — the union of module-declared `package.json` entries must equal the kit's real `package.json`, minus a kit-tooling allowlist.

## Self-Review

**Spec coverage:** `add` → Task 2; `remove` → Task 3; reference-counted fragment removal → falls out of the leaf-level structured merge (a key still declared by a surviving module is never removed), verified by Task 3's marker-strip test and the existing structured tests; dependents check → Task 3; single-revision invariant on `add` → Task 2.

**Design note worth keeping:** treating add/remove as a transition between module sets means all three mutating commands share one planner, one merge path, and one apply path. The alternative in the original spec — contextual patch insertion for marker blocks — would have been a second, weaker code path for the same problem.

**Placeholder scan:** none. **Type consistency:** `ChangeReport` is defined once in `add.ts` and imported by `remove.ts`; `ActionType` and `ApplyResult` come from Plan 2 unchanged.
