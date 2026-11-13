import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../src/commands/init';
import { runUpgrade } from '../../src/commands/upgrade';
import { CliError } from '../../src/errors';
import { DEFAULT_TEMPLATE, openKit, type KitSnapshot } from '../../src/kit/source';
import { readState, STATE_FILE, writeState } from '../../src/project/state';
import { listFiles, pathExists, writeTextFile } from '../../src/util/fs';
import { createFixtureKit, makeTempDir } from '../support/fixtureKit';

const identity = { name: 'my-project', description: 'A user-owned project' };
const homePath = 'app/pages/index.vue';
let fixture: Awaited<ReturnType<typeof createFixtureKit>>;
let v1: KitSnapshot;
let v2: KitSnapshot;
let parent: string;
let projectRoot: string;

beforeAll(async () => {
  fixture = await createFixtureKit();
  const source = { kind: 'local', path: fixture.root, allowDirty: false } satisfies Parameters<
    typeof openKit
  >[0];
  v1 = await openKit(source, fixture.v1, DEFAULT_TEMPLATE);
  v2 = await openKit(source, fixture.v2, DEFAULT_TEMPLATE);
});
afterAll(async () => {
  await v1?.cleanup();
  await v2?.cleanup();
  if (fixture) await rm(fixture.root, { recursive: true, force: true });
});
beforeEach(async () => {
  parent = await makeTempDir('upgrade');
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

function init(requested = ['beta'], git = true) {
  return runInit({ target: projectRoot, identity, requested, kit: v1, git });
}

function upgrade(check = false, force = false, to = v2, from = v1) {
  return runUpgrade({ projectRoot, from, to, check, force });
}

async function projectFiles(root: string, includeState = false): Promise<Map<string, Buffer>> {
  const paths = (await listFiles(root)).filter(
    (path) => !path.startsWith('.git/') && (includeState || path !== STATE_FILE),
  );
  const files = new Map<string, Buffer>();
  for (const path of paths) files.set(path, await readFile(join(root, path)));
  return files;
}

async function expectRefused(operation: () => Promise<unknown>, message: string): Promise<void> {
  const before = await projectFiles(projectRoot, true);
  const outcome = operation();
  await expect(outcome).rejects.toThrow(CliError);
  await expect(outcome).rejects.toThrow(message);
  expect(await projectFiles(projectRoot, true)).toEqual(before);
}

async function edit(path: string, oldText: string, newText: string): Promise<void> {
  const absolute = join(projectRoot, path);
  const contents = await readFile(absolute, 'utf8');
  expect(contents).toContain(oldText);
  await writeTextFile(absolute, contents.replace(oldText, newText));
}

describe('runUpgrade', () => {
  it('makes untouched init@v1(beta) + upgrade byte-identical to init@v2(beta)', async () => {
    expect((await init()).git).toBe('committed');
    const reference = join(parent, 'reference');
    await runInit({ target: reference, identity, requested: ['beta'], kit: v2, git: false });
    const before = await readState(projectRoot);

    const report = await upgrade();

    const actual = await projectFiles(projectRoot);
    const expected = await projectFiles(reference);
    const differingPaths = [...new Set([...actual.keys(), ...expected.keys()])].filter(
      (path) => !actual.get(path)?.equals(expected.get(path) ?? Buffer.alloc(0)),
    );
    expect(differingPaths, 'Differing paths after upgrade versus fresh init').toEqual([]);
    expect([...actual.keys()]).toEqual([...expected.keys()]);
    expect(report).toMatchObject({
      upToDate: false,
      applied: true,
      conflicts: [],
      addedModules: [],
      removedModules: [],
    });
    expect(report.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'app/pages/new.vue', kind: 'create' }),
        expect.objectContaining({ path: 'obsolete.txt', kind: 'delete' }),
      ]),
    );
    expect(await readState(projectRoot)).toEqual({ ...before, commit: fixture.v2 });
  });

  it('merges a non-overlapping user edit with the upstream home change', async () => {
    await init();
    await edit(homePath, 'Fixture footer', 'User footer');

    const report = await upgrade(false, true);

    expect(report.changes).toContainEqual(
      expect.objectContaining({ path: homePath, kind: 'merge' }),
    );
    expect(report.conflicts).toEqual([]);
    const home = await readFile(join(projectRoot, homePath), 'utf8');
    expect(home).toContain('Home v2');
    expect(home).toContain('User footer');
  });

  it('writes overlapping edits as conflicts and advances the recorded commit', async () => {
    await init();
    await edit(homePath, 'Home v1', 'User home');
    const before = await readState(projectRoot);

    const report = await upgrade(false, true);

    expect(report).toMatchObject({ conflicts: [homePath], applied: true, upToDate: false });
    expect(report.changes).toContainEqual(
      expect.objectContaining({ path: homePath, kind: 'conflict' }),
    );
    expect(await readState(projectRoot)).toEqual({
      ...before,
      commit: fixture.v2,
      conflicts: [homePath],
    });
    const home = await readFile(join(projectRoot, homePath), 'utf8');
    expect(home).toContain('<<<<<<< yours');
    expect(home).toContain('User home');
    expect(home).toContain('Home v2');
    await expectRefused(() => upgrade(true, true, v2, v2), homePath);
  });

  it('preserves renamed package and worker identities while merging v2 root changes', async () => {
    await init();
    await edit('package.json', '"name": "my-project"', '"name": "renamed"');
    await edit('wrangler.jsonc', '"name": "my-project"', '"name": "renamed-worker"');

    const report = await upgrade(false, true);

    expect(report.conflicts).toEqual([]);
    for (const path of ['package.json', 'wrangler.jsonc']) {
      expect(report.changes).toContainEqual(expect.objectContaining({ path, kind: 'merge' }));
    }
    const pkg = await readFile(join(projectRoot, 'package.json'), 'utf8');
    const wrangler = await readFile(join(projectRoot, 'wrangler.jsonc'), 'utf8');
    expect(pkg.split('\n')).toContain('  "name": "renamed",');
    expect(pkg.split('\n')).toContain('    "base-dep": "2.0.0",');
    expect(wrangler.split('\n')).toContain('  "name": "renamed-worker",');
    expect(wrangler.split('\n')).toContain('  "compatibility_flags": ["nodejs_compat"]');
    expect((await readState(projectRoot)).identity).toEqual(identity);
  });

  it('reports dependency, schema and newly introduced env follow-ups', async () => {
    await init();
    const report = await upgrade();
    expect(report.followUps).toEqual([
      'pnpm install',
      'pnpm db:generate',
      'Add ALPHA_SECOND to .env',
    ]);
    expect(await readFile(join(projectRoot, '.env.example'), 'utf8')).toContain('ALPHA_SECOND=');
  });

  it('returns upToDate without writes or a clean-tree requirement at the recorded commit', async () => {
    await init();
    await upgrade();
    const before = await projectFiles(projectRoot, true);

    expect(await upgrade(false, false, v2, v2)).toEqual({
      upToDate: true,
      applied: false,
      changes: [],
      conflicts: [],
      followUps: [],
      addedModules: [],
      removedModules: [],
    });
    expect(await projectFiles(projectRoot, true)).toEqual(before);
  });

  it('checks the complete plan on a dirty tree without writing files or state', async () => {
    await init();
    await edit(homePath, 'Home v1', 'User home');
    const before = await projectFiles(projectRoot, true);

    const report = await upgrade(true);

    expect(report).toMatchObject({ applied: false, upToDate: false, conflicts: [homePath] });
    expect(report.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'package.json', kind: 'update' }),
        expect.objectContaining({ path: '.env.example', kind: 'update' }),
        expect.objectContaining({ path: 'wrangler.jsonc', kind: 'update' }),
      ]),
    );
    expect(await projectFiles(projectRoot, true)).toEqual(before);
  });

  it('resolves new transitive requirements and reports newly installed modules', async () => {
    await init();
    const to = {
      ...v2,
      modules: v2.modules.map((module) =>
        module.id === 'alpha' ? { ...module, requires: ['docs'] } : module,
      ),
    };

    const report = await upgrade(false, false, to);

    expect(report.addedModules).toEqual(['docs']);
    expect(report.removedModules).toEqual([]);
    expect((await readState(projectRoot)).modules).toEqual(['alpha', 'beta', 'docs']);
    expect(await pathExists(join(projectRoot, 'layers/docs/module.json'))).toBe(true);
    expect(await pathExists(join(projectRoot, 'content/hello.md'))).toBe(true);
  });

  it('lists all installed modules missing from the target before checking dirtiness', async () => {
    await init();
    await writeTextFile(join(projectRoot, 'user.txt'), 'dirty\n');
    const to = { ...v2, modules: v2.modules.filter((module) => module.id === 'docs') };
    await expectRefused(() => upgrade(false, false, to), 'alpha, beta');
  });

  it('checks the recorded source commit before target validation, including a same-commit request', async () => {
    await init();
    const invalidTarget = { ...v2, modules: [] };
    await expectRefused(() => upgrade(true, true, invalidTarget, v2), fixture.v1);
  });

  it('refuses previous unresolved conflicts before checking the source commit', async () => {
    await init();
    await writeTextFile(
      join(projectRoot, homePath),
      '<<<<<<< yours\nours\n=======\ntheirs\n>>>>>>> kit (new)\n',
    );
    const state = await readState(projectRoot);
    await writeState(projectRoot, { ...state, conflicts: [homePath] });
    await expectRefused(() => upgrade(true, true, v2, v2), homePath);
  });

  it('clears resolved prior conflicts only when applying the transition', async () => {
    await init();
    const state = await readState(projectRoot);
    await writeState(projectRoot, { ...state, conflicts: [homePath] });
    expect((await upgrade(true)).conflicts).toEqual([]);
    expect((await readState(projectRoot)).conflicts).toEqual([homePath]);
    await upgrade(false, true);
    expect((await readState(projectRoot)).conflicts).toEqual([]);
  });

  it('refuses dirty trees unless forced and preserves unrelated user files', async () => {
    await init();
    await writeTextFile(join(projectRoot, 'user.txt'), 'dirty\n');
    await expectRefused(() => upgrade(), 'commit or stash');
    expect((await upgrade(false, true)).applied).toBe(true);
    expect(await readFile(join(projectRoot, 'user.txt'), 'utf8')).toBe('dirty\n');
  });

  it('requires git unless checking or forced', async () => {
    await init(['beta'], false);
    await expectRefused(() => upgrade(), 'needs git');
    expect((await upgrade(true)).applied).toBe(false);
    expect((await upgrade(false, true)).applied).toBe(true);
  });

  it('requires managed state before comparing commits', async () => {
    await expect(upgrade(true, true, v1)).rejects.toThrow('not a create-nuxt-saas project');
    expect(await pathExists(projectRoot)).toBe(false);
  });
});
