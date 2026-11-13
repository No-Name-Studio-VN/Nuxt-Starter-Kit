import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../src/commands/init';
import { runModuleChange } from '../../src/commands/modules';
import { CliError } from '../../src/errors';
import { DEFAULT_TEMPLATE, openKit, type KitSnapshot } from '../../src/kit/source';
import { readState, STATE_FILE, writeState } from '../../src/project/state';
import { listFiles, pathExists, writeTextFile } from '../../src/util/fs';
import { createFixtureKit, makeTempDir } from '../support/fixtureKit';

const run = promisify(execFile);
const identity = { name: 'renamed-project', description: 'A user-owned project' };
const betaPath = 'layers/beta/server/db/schema.sqlite.ts';
let fixture: Awaited<ReturnType<typeof createFixtureKit>>;
let kit: KitSnapshot;
let parent: string;
let projectRoot: string;

beforeAll(async () => {
  fixture = await createFixtureKit();
  kit = await openKit(
    { kind: 'local', path: fixture.root, allowDirty: false },
    fixture.v1,
    DEFAULT_TEMPLATE,
  );
});
afterAll(async () => {
  await kit?.cleanup();
  if (fixture) await rm(fixture.root, { recursive: true, force: true });
});
beforeEach(async () => {
  parent = await makeTempDir('modules');
  projectRoot = join(parent, 'project');
  vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  vi.stubEnv('GIT_AUTHOR_NAME', 'Fixture Author');
  vi.stubEnv('GIT_AUTHOR_EMAIL', 'fixture@example.invalid');
  vi.stubEnv('GIT_COMMITTER_NAME', 'Fixture Author');
  vi.stubEnv('GIT_COMMITTER_EMAIL', 'fixture@example.invalid');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(parent, { recursive: true, force: true });
});

function init(requested: string[] = [], target = projectRoot, git = true) {
  return runInit({ target, identity, requested, kit, git });
}

function change(add: string[] = [], remove: string[] = [], check = false, force = false) {
  return runModuleChange({ projectRoot, add, remove, kit, check, force });
}

async function projectFiles(root: string, includeState = false): Promise<Map<string, Buffer>> {
  const paths = (await listFiles(root)).filter(
    (path) => !path.startsWith('.git/') && (includeState || path !== STATE_FILE),
  );
  const files = new Map<string, Buffer>();
  for (const path of paths) files.set(path, await readFile(join(root, path)));
  return files;
}

async function expectSameTree(left: string, right: string): Promise<void> {
  const actual = await projectFiles(left);
  const expected = await projectFiles(right);
  expect([...actual.keys()]).toEqual([...expected.keys()]);
  for (const [path, bytes] of expected) expect(actual.get(path), path).toEqual(bytes);
}

async function expectRefused(operation: Promise<unknown>, message: string): Promise<void> {
  const outcome = operation.then(
    () => undefined,
    (error: unknown) => error,
  );
  const before = await projectFiles(projectRoot, true);
  const error = await outcome;
  expect(error).toBeInstanceOf(CliError);
  expect(error instanceof Error ? error.message : '').toContain(message);
  expect(await projectFiles(projectRoot, true)).toEqual(before);
}

describe('runModuleChange', () => {
  it('makes init([]) + add(beta) byte-identical to init(beta)', async () => {
    const initial = await init();
    expect(initial.git).toBe('committed');
    const reference = join(parent, 'reference');
    await init(['beta'], reference, false);
    const before = await readState(projectRoot);

    const report = await change(['beta']);

    await expectSameTree(projectRoot, reference);
    expect(report).toMatchObject({
      addedModules: ['alpha', 'beta'],
      removedModules: [],
      conflicts: [],
      applied: true,
      followUps: ['pnpm install', 'pnpm db:generate', 'Add ALPHA_KEY to .env'],
    });
    expect(await readState(projectRoot)).toEqual({ ...before, modules: ['alpha', 'beta'] });
  });

  it('makes init(beta) + remove(beta) byte-identical to init(alpha)', async () => {
    await init(['beta']);
    const reference = join(parent, 'reference');
    await init(['alpha'], reference, false);

    const report = await change([], ['beta']);

    await expectSameTree(projectRoot, reference);
    expect(await pathExists(join(projectRoot, 'layers/beta'))).toBe(false);
    expect(report).toMatchObject({ addedModules: [], removedModules: ['beta'], applied: true });
    expect((await readState(projectRoot)).modules).toEqual(['alpha']);
  });

  it('refuses removal of alpha while beta still requires it, before checking dirtiness', async () => {
    await init(['beta']);
    await writeTextFile(join(projectRoot, 'user.txt'), 'dirty\n');
    await expectRefused(change([], ['alpha']), 'beta');
  });

  it('also refuses directly removing an internal dependency', async () => {
    await init(['beta']);
    const internalKit = {
      ...kit,
      modules: kit.modules.map((module) => ({ ...module, internal: module.id === 'alpha' })),
    };
    await expectRefused(
      runModuleChange({
        projectRoot,
        add: [],
        remove: ['alpha'],
        kit: internalKit,
        check: false,
        force: false,
      }),
      'beta',
    );
  });

  it('allows removing a dependency together with all its installed dependents', async () => {
    await init(['beta']);
    const reference = join(parent, 'reference');
    await init([], reference, false);
    const report = await change([], ['alpha', 'beta']);
    await expectSameTree(projectRoot, reference);
    expect(report.removedModules).toEqual(['alpha', 'beta']);
    expect((await readState(projectRoot)).modules).toEqual([]);
  });

  it('keeps edited files from a removed module and reports keep-edited', async () => {
    await init(['beta']);
    const edited = "export const betaTable = { name: 'mine' };\n";
    await writeTextFile(join(projectRoot, betaPath), edited);
    await run('git', ['-C', projectRoot, 'add', '.']);
    await run('git', ['-C', projectRoot, 'commit', '-m', 'customize beta']);

    const report = await change([], ['beta']);

    expect(report.changes).toContainEqual({ path: betaPath, kind: 'keep-edited' });
    expect(await readFile(join(projectRoot, betaPath), 'utf8')).toBe(edited);
    expect((await readState(projectRoot)).modules).toEqual(['alpha']);
  });

  it('creates protected content on add and keeps it on remove', async () => {
    await init();
    const added = await change(['docs']);
    expect(added.changes).toContainEqual({
      path: 'content/hello.md',
      kind: 'create',
      content: Buffer.from('# Hello\n'),
    });
    expect(await readFile(join(projectRoot, 'content/hello.md'), 'utf8')).toBe('# Hello\n');

    const removed = await change([], ['docs'], false, true);
    expect(removed.changes).toContainEqual({ path: 'content/hello.md', kind: 'keep-protected' });
    expect(await readFile(join(projectRoot, 'content/hello.md'), 'utf8')).toBe('# Hello\n');
    expect((await readState(projectRoot)).modules).toEqual([]);
  });

  it('plans the full addition on a dirty tree without writing, including the state file', async () => {
    await init();
    await writeTextFile(join(projectRoot, 'user.txt'), 'dirty\n');
    const before = await projectFiles(projectRoot, true);

    const report = await change(['beta'], [], true);

    expect(report).toMatchObject({
      applied: false,
      addedModules: ['alpha', 'beta'],
      removedModules: [],
    });
    expect(report.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'package.json', kind: 'update' }),
        expect.objectContaining({ path: '.env.example', kind: 'update' }),
        expect.objectContaining({ path: 'wrangler.jsonc', kind: 'update' }),
      ]),
    );
    expect(report.followUps).toEqual(['pnpm install', 'pnpm db:generate', 'Add ALPHA_KEY to .env']);
    expect(await projectFiles(projectRoot, true)).toEqual(before);
  });

  it('refuses dirty trees unless force is set', async () => {
    await init();
    await writeTextFile(join(projectRoot, 'user.txt'), 'dirty\n');
    await expectRefused(change(['beta']), 'commit or stash');
    expect((await change(['beta'], [], false, true)).applied).toBe(true);
    expect(await readFile(join(projectRoot, 'user.txt'), 'utf8')).toBe('dirty\n');
  });

  it('refuses projects without git but permits check and force', async () => {
    await init([], projectRoot, false);
    await expectRefused(change(['beta']), 'needs git');
    expect((await change(['beta'], [], true)).applied).toBe(false);
    expect((await change(['beta'], [], false, true)).applied).toBe(true);
  });

  it.each(['add', 'remove'])(
    'refuses an unknown id for %s before the dirty-tree check',
    async (mode) => {
      await init();
      await writeTextFile(join(projectRoot, 'user.txt'), 'dirty\n');
      await expectRefused(
        change(mode === 'add' ? ['missing'] : [], mode === 'remove' ? ['missing'] : []),
        'Unknown module "missing"',
      );
    },
  );

  it('reports required dependents before other uninstalled removals', async () => {
    await init(['beta']);
    await expectRefused(change([], ['alpha', 'docs']), 'beta');
  });

  it('refuses removing a known but uninstalled module', async () => {
    await init();
    await expectRefused(change([], ['beta']), 'not installed');
  });

  it('checks the recorded commit before validating ids and does not write', async () => {
    await init();
    await expectRefused(
      runModuleChange({
        projectRoot,
        add: ['missing'],
        remove: [],
        kit: { ...kit, commit: fixture.v2 },
        check: true,
        force: true,
      }),
      fixture.v1,
    );
  });

  it('refuses previous unresolved conflicts even for check and force, before checking the commit', async () => {
    await init();
    await writeTextFile(
      join(projectRoot, 'app/pages/index.vue'),
      '<<<<<<< yours\nours\n=======\ntheirs\n>>>>>>> kit (new)\n',
    );
    const state = await readState(projectRoot);
    await writeState(projectRoot, { ...state, conflicts: ['app/pages/index.vue'] });
    await expectRefused(
      runModuleChange({
        projectRoot,
        add: ['missing'],
        remove: [],
        kit: { ...kit, commit: fixture.v2 },
        check: true,
        force: true,
      }),
      'app/pages/index.vue',
    );
  });

  it('records sorted new conflicts and advances modules while retaining kit, commit and identity', async () => {
    await init();
    await writeTextFile(join(projectRoot, betaPath), 'user schema\n');
    await writeTextFile(join(projectRoot, 'layers/beta/module.json'), 'user metadata\n');
    const before = await readState(projectRoot);
    const report = await change(['beta'], [], false, true);
    const conflicts = ['layers/beta/module.json', betaPath];

    expect(report.conflicts).toEqual(conflicts);
    expect(report.applied).toBe(true);
    expect(await readState(projectRoot)).toEqual({
      ...before,
      modules: ['alpha', 'beta'],
      conflicts,
    });
    for (const path of conflicts) {
      expect(await readFile(join(projectRoot, path), 'utf8')).toContain('<<<<<<< yours');
    }
    await expectRefused(change([], [], true, true), betaPath);
  });

  it('clears resolved prior conflicts only when applying, not checking', async () => {
    await init();
    const state = await readState(projectRoot);
    await writeState(projectRoot, { ...state, conflicts: ['app/pages/index.vue'] });
    expect((await change(['beta'], [], true)).conflicts).toEqual([]);
    expect((await readState(projectRoot)).conflicts).toEqual(['app/pages/index.vue']);
    await change(['beta'], [], false, true);
    expect((await readState(projectRoot)).conflicts).toEqual([]);
  });

  it('treats already-installed additions as a no-op', async () => {
    await init(['beta']);
    const before = await projectFiles(projectRoot, true);
    expect(await change(['beta', 'beta'])).toEqual({
      changes: [],
      conflicts: [],
      followUps: [],
      addedModules: [],
      removedModules: [],
      applied: true,
    });
    expect(await projectFiles(projectRoot, true)).toEqual(before);
  });

  it('requires a managed project before inspecting conflicts or validating ids', async () => {
    const operation = change(['missing'], [], true, true);
    await expect(operation).rejects.toThrow(CliError);
    await expect(operation).rejects.toThrow('not a create-nuxt-saas project');
    expect(await pathExists(projectRoot)).toBe(false);
  });
});
