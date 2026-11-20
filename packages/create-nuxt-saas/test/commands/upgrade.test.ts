import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { main } from '../../src/cli';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../src/commands/init';
import { runUpgrade } from '../../src/commands/upgrade';
import { CliError } from '../../src/errors';
import { DEFAULT_TEMPLATE, openKit, type KitSnapshot } from '../../src/kit/source';
import { readState, STATE_FILE, writeState } from '../../src/project/state';
import { listFiles, pathExists, writeTextFile } from '../../src/util/fs';
import { createFixtureKit, makeTempDir } from '../support/fixtureKit';

const run = promisify(execFile);
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

function upgrade(check = false, force = false, to = v2, from = v1, backup = true) {
  return runUpgrade({ projectRoot, from, to, check, force, backup });
}

async function git(...args: string[]): Promise<string> {
  const { stdout } = await run('git', ['-C', projectRoot, ...args]);
  return stdout.trim();
}

async function undo(...args: string[]): Promise<{ code: number; report: unknown }> {
  const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    const code = await main(['undo', '--dir', projectRoot, '--json', ...args]);
    const report: unknown = JSON.parse(output.mock.calls.map(([part]) => String(part)).join(''));
    return { code, report };
  } finally {
    output.mockRestore();
  }
}


async function projectFiles(root: string, includeState = false): Promise<Map<string, Buffer>> {
  const paths = (await listFiles(root)).filter(
    (path) => !path.startsWith('.git/') && (includeState || (path !== STATE_FILE && !path.startsWith('.nuxt-saas/'))),
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
  it('records the target template when upgrading onto a fork', async () => {
    await init();
    await upgrade(false, false, { ...v2, template: 'github:fork/repo#custom' });
    expect((await readState(projectRoot)).kit).toBe('github:fork/repo#custom');
  });

  it('records a template switch even when the fork shares the same commit', async () => {
    await init();
    await upgrade(false, false, { ...v1, template: 'github:fork/repo' });
    expect((await readState(projectRoot)).kit).toBe('github:fork/repo');
  });

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
    expect(report).toMatchObject({
      unsaved: { total: 0, risky: [], touched: [], untouched: 0 },
      backup: { status: 'complete' },
      report: '.nuxt-saas/upgrade-report.md',
    });
  });

  it('merges a non-overlapping user edit with the upstream home change', async () => {
    await init();
    await edit(homePath, 'Fixture footer', 'User footer');

    const report = await upgrade();

    expect(report).toMatchObject({ unsaved: { total: 1, risky: [], touched: [homePath], untouched: 0 } });
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

    expect(report).toMatchObject({ conflicts: [homePath], applied: true, upToDate: false, backup: { status: 'complete' } });
    const saved: unknown = JSON.parse(await readFile(join(projectRoot, '.nuxt-saas/upgrade-report.json'), 'utf8'));
    expect(saved).toMatchObject({
      schema: 1, command: 'upgrade', from: fixture.v1, to: fixture.v2, fromVersion: '1.0.0', toVersion: '2.0.0',
      conflicts: [homePath], report: '.nuxt-saas/upgrade-report.md', resolutions: [],
    });
    expect(await readFile(join(projectRoot, '.nuxt-saas/kit-versions', homePath), 'utf8')).toContain('Home v2');
    expect(await readFile(join(projectRoot, '.nuxt-saas/upgrade-report.md'), 'utf8')).toContain('Needs your decision');
    expect(await git('status', '--porcelain')).not.toContain('.nuxt-saas/');
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
      unsaved: expect.objectContaining({ risky: [] }),
      backup: null,
      report: null,
      notes: [],
      suggestions: [],
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

  it('applies a dirty but safe tree without --force', async () => {
    await init();
    await writeTextFile(join(projectRoot, 'user.txt'), 'dirty\n');
    expect(await upgrade()).toMatchObject({ applied: true, unsaved: { total: 1, risky: [], touched: [], untouched: 1 } });
    expect(await readFile(join(projectRoot, 'user.txt'), 'utf8')).toBe('dirty\n');
  });

  it('requires --force for risky non-interactive work and reports the affected path', async () => {
    await init();
    await edit(homePath, 'Home v1', 'User home');
    await expectRefused(() => upgrade(), homePath);
    await expect(upgrade()).rejects.toThrow('--force');
    expect(await git('for-each-ref', 'refs/nuxt-saas/backups')).toBe('');
  });

  it.each(['continue', 'preview', 'cancel'] satisfies ('continue' | 'preview' | 'cancel')[])(
    'honors an injected %s choice for risky work', async (choice) => {
      await init();
      await edit(homePath, 'Home v1', 'User home');
      const before = await projectFiles(projectRoot, true);
      const report = await runUpgrade({
        projectRoot, from: v1, to: v2, check: false, force: false,
        ...{ confirmRisk: async () => choice },
      });
      expect(report.applied).toBe(choice === 'continue');
      if (choice !== 'continue') {
        expect(await projectFiles(projectRoot, true)).toEqual(before);
        expect(await git('for-each-ref', 'refs/nuxt-saas/backups')).toBe('');
      }
    },
  );

  it('requires both --force and --no-backup to write without git', async () => {
    await init(['beta'], false);
    await expectRefused(() => upgrade(), "isn't in git");
    await expectRefused(() => upgrade(false, false, v2, v1, false), '--force');
    await expectRefused(() => upgrade(false, true), '--no-backup');
    expect(await upgrade(true)).toMatchObject({ applied: false, unsaved: null, backup: null });
    expect(await upgrade(false, true, v2, v1, false)).toMatchObject({ applied: true, unsaved: null, backup: null });
  });

  it('restores an unborn project and leaves HEAD unborn', async () => {
    await init(['beta'], false);
    await git('init');
    await git('add', '--', STATE_FILE);
    const index = await git('write-tree');
    const before = await projectFiles(projectRoot, true);
    expect(await upgrade(false, true)).toMatchObject({ backup: { status: 'complete' } });
    expect(await undo('--yes')).toMatchObject({ code: 0, report: { restored: true } });
    expect(await git('write-tree')).toBe(index);
    await expect(git('rev-parse', '--verify', 'HEAD')).rejects.toThrow();
    expect(await projectFiles(projectRoot, true)).toEqual(before);
  });

  it('restores untracked, ignored, CRLF and binary files and preserves the staged version', async () => {
    await init();
    await git('config', 'core.autocrlf', 'true');
    await writeTextFile(join(projectRoot, '.gitattributes'), '*.vue text eol=lf\n');
    await writeTextFile(join(projectRoot, '.gitignore'), 'obsolete.txt\napp/pages/new.vue\n');
    await git('rm', '--cached', 'obsolete.txt');
    await git('add', '.gitattributes', '.gitignore');
    await git('commit', '-m', 'set project attributes');
    await writeTextFile(join(projectRoot, homePath), 'Staged home\r\n');
    await git('add', '--', homePath);
    await writeTextFile(join(projectRoot, homePath), 'Worktree home\r\n');
    await git('rm', '--cached', '--', 'public/logo.png');
    const before = await projectFiles(projectRoot, true);
    const index = await git('write-tree');
    const status = await git('status', '--porcelain=v1', '-z');
    expect(await upgrade(false, true)).toMatchObject({ backup: { status: 'complete' } });
    expect(await readFile(join(projectRoot, 'public/logo.png'))).not.toEqual(before.get('public/logo.png'));
    expect(await pathExists(join(projectRoot, 'obsolete.txt'))).toBe(false);
    expect(await undo('--check')).toMatchObject({ code: 0, report: { restorable: true, restored: false, blocked: null } });
    expect(await undo('--yes')).toMatchObject({ code: 0, report: { restored: true, backup: { status: 'restored' } } });
    expect(await projectFiles(projectRoot, true)).toEqual(before);
    expect(await git('write-tree')).toBe(index);
    expect(await git('status', '--porcelain=v1', '-z')).toBe(status);
    expect(await undo('--check')).toMatchObject({ code: 0, report: { blocked: { reason: 'no-backup' } } });
    expect(await undo('--yes')).toMatchObject({ code: 1, report: { error: { kind: 'expected' } } });
    expect(await undo('--list')).toMatchObject({ code: 0, report: { backups: [{ status: 'restored' }] } });
  });

  it('only touches the project in a containing repository', async () => {
    await init(['beta'], false);
    const outside = join(parent, 'outside.txt');
    await writeTextFile(outside, 'original');
    await git('init', '..');
    await git('add', '--', '.', '../outside.txt');
    await git('commit', '-m', 'initial');
    await edit(homePath, 'Home v1', 'User home');
    expect(await upgrade(true)).toMatchObject({ unsaved: { total: 1, risky: [{ path: homePath, kind: 'conflict' }] } });
    await upgrade(false, true);
    await writeTextFile(outside, 'staged since upgrade');
    await git('add', '--', '../outside.txt');
    await writeTextFile(outside, 'edited since upgrade');
    expect(await undo('--yes')).toMatchObject({ code: 0, report: { restored: true } });
    expect(await readFile(outside, 'utf8')).toBe('edited since upgrade');
    expect(await git('show', ':outside.txt')).toBe('staged since upgrade');
    expect(await readFile(join(projectRoot, homePath), 'utf8')).toContain('User home');
  });

  it('blocks undo for post-upgrade edits (including staged-only edits and recreated ignored files)', async () => {
    await init();
    await writeTextFile(join(projectRoot, '.gitignore'), 'obsolete.txt\n');
    await git('rm', '--cached', 'obsolete.txt');
    await git('add', '.gitignore');
    await git('commit', '-m', 'ignore obsolete');
    await upgrade();
    await writeTextFile(join(projectRoot, 'new-work.txt'), 'new work');
    await writeTextFile(join(projectRoot, 'obsolete.txt'), 'recreated ignored file');
    const after = await readFile(join(projectRoot, homePath));
    await writeTextFile(join(projectRoot, homePath), 'staged only');
    await git('add', '--', homePath);
    await writeFile(join(projectRoot, homePath), after);
    expect(await undo('--check')).toMatchObject({ code: 0, report: { restorable: false, blocked: { reason: 'changes', paths: [homePath, 'new-work.txt', 'obsolete.txt'] } } });
    expect(await undo('--yes')).toMatchObject({ code: 1 });
    expect(await readFile(join(projectRoot, 'obsolete.txt'), 'utf8')).toBe('recreated ignored file');
  });

  it('allows a branch change at the same HEAD but blocks undo after a commit', async () => {
    await init();
    await upgrade();
    await git('switch', '-c', 'upgrade-branch');
    expect(await undo('--check')).toMatchObject({ code: 0, report: { restorable: true } });
    await git('commit', '--allow-empty', '-m', 'commit after upgrade');
    expect(await undo('--check')).toMatchObject({ code: 0, report: { blocked: { reason: 'moved-head', paths: [] } } });
  });

  it('explains an interrupted before-only backup without suggesting a destructive checkout', async () => {
    await init();
    const { backup } = await upgrade();
    if (!backup) throw new Error('Expected a backup');
    const head = await git('rev-parse', backup.ref);
    await git('update-ref', backup.ref, `${head}^`, head);
    const { code, report } = await undo('--check', '--backup', backup.name);
    expect(code).toBe(0);
    expect(report).toMatchObject({ backup: { status: 'pending' }, blocked: { reason: 'pending', paths: [] }, restorable: false });
    expect(JSON.stringify(report)).toContain(backup.ref);
    expect(JSON.stringify(report)).not.toContain('checkout');
  });

  it('adds a numeric suffix to a same-second backup and can explicitly check the older one', async () => {
    await init();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-11-21T09:12:42Z'));
      await upgrade();
      await upgrade(false, false, v1, v2);
      expect(await undo('--list')).toMatchObject({ code: 0, report: { backups: [
        { name: '2026-11-21T091242Z-2' }, { name: '2026-11-21T091242Z' },
      ] } });
      expect(await undo('--check', '--backup', '2026-11-21T091242Z')).toMatchObject({
        code: 0, report: { backup: { name: '2026-11-21T091242Z' }, restorable: true, blocked: null, files: 0 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('prunes active and restored refs older than 14 days', async () => {
    await init();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
      await upgrade();
      expect(await undo('--yes')).toMatchObject({ code: 0, report: { restored: true } });
      await upgrade();
      vi.setSystemTime(new Date('2020-01-16T00:00:00Z'));
      await upgrade(false, false, v1, v2);
      expect(await undo('--list')).toMatchObject({ code: 0, report: { backups: [expect.objectContaining({ name: '2020-01-16T000000Z' })] } });
      expect(await git('for-each-ref', '--format=%(refname)', 'refs/nuxt-saas')).toBe('refs/nuxt-saas/backups/2020-01-16T000000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks a partial apply as failed and restores the files already changed', async () => {
    await init();
    const before = await readFile(join(projectRoot, homePath));
    await edit('obsolete.txt', 'Removed in v2', 'my work');
    const blocker = join(projectRoot, 'app/pages/new.vue');
    const options = {
      projectRoot, from: v1, to: v2, check: false, force: false,
      confirmRisk: async (): Promise<'continue'> => {
        await mkdir(blocker);
        return 'continue';
      },
    };
    await expect(runUpgrade(options)).rejects.toThrow('nuxt-saas undo');
    expect(await readFile(join(projectRoot, homePath))).not.toEqual(before);
    expect(await undo('--check')).toMatchObject({ code: 0, report: { restorable: true, backup: { status: 'failed' } } });
    expect(await undo('--yes')).toMatchObject({ code: 0, report: { restored: true } });
    expect(await readFile(join(projectRoot, homePath))).toEqual(before);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('resumes a partial undo without discarding already-restored files', async () => {
    await init();
    await edit(homePath, 'Fixture footer', 'My unsaved work');
    const before = await projectFiles(projectRoot, true);
    await upgrade();
    const blockedDirectory = join(projectRoot, 'public');
    await chmod(blockedDirectory, 0o555);
    try {
      expect(await undo('--yes')).toMatchObject({ code: 2 });
      expect(await readFile(join(projectRoot, homePath))).toEqual(before.get(homePath));
      expect(await pathExists(join(projectRoot, 'app/pages/new.vue'))).toBe(false);
      expect(await readFile(join(projectRoot, 'obsolete.txt'))).toEqual(before.get('obsolete.txt'));
      expect(await readFile(join(projectRoot, 'public/logo.png'))).not.toEqual(before.get('public/logo.png'));
    } finally {
      await chmod(blockedDirectory, 0o755);
    }
    expect(await undo('--check')).toMatchObject({ code: 0, report: { restorable: true, blocked: null } });
    expect(await undo('--yes')).toMatchObject({ code: 0, report: { restored: true } });
    expect(await projectFiles(projectRoot, true)).toEqual(before);
  });

  it('keeps the completed upgrade successful if pruning cannot delete an expired ref', async () => {
    await init();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
      const { backup } = await upgrade();
      if (!backup) throw new Error('Expected a backup');
      await writeFile(join(projectRoot, '.git', `${backup.ref}.lock`), '');
      vi.setSystemTime(new Date('2020-01-16T00:00:00Z'));
      expect(await upgrade(false, false, v1, v2)).toMatchObject({ applied: true, backup: { status: 'complete' } });
      expect((await readState(projectRoot)).commit).toBe(fixture.v1);
      expect(await undo('--list')).toMatchObject({ report: { backups: [{ status: 'complete' }, { name: backup.name }] } });
    } finally {
      vi.useRealTimers();
    }
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0).each([false, true])('keeps the JSON backup and exit code when saving a report fails (conflict: %s)', async (conflict) => {
    await init();
    if (conflict) await edit(homePath, 'Home v1', 'My conflicting work');
    const reportDirectory = join(projectRoot, '.nuxt-saas');
    await mkdir(reportDirectory, { mode: 0o555 });
    const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const code = await main(['upgrade', '--dir', projectRoot, '--kit', fixture.root, '--force', '--json']);
      const report: unknown = JSON.parse(output.mock.calls.map(([part]) => String(part)).join(''));
      expect(code).toBe(conflict ? 3 : 0);
      expect(report).toMatchObject({ applied: true, report: null, backup: { name: expect.any(String), status: 'complete' } });
      expect(warnings.mock.calls.flat().join('')).toContain('could not be saved');
      expect((await readState(projectRoot)).commit).toBe(fixture.v2);
    } finally {
      output.mockRestore();
      warnings.mockRestore();
      await chmod(reportDirectory, 0o755);
    }
    expect(await undo('--yes')).toMatchObject({ code: 0, report: { restored: true } });
  });

  it('isolates undo, list and pruning across linked worktrees', async () => {
    await init();
    const linked = join(parent, 'linked');
    await git('worktree', 'add', '--detach', linked, 'HEAD');
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2020-01-01T00:00:00Z'));
      const { backup: mainBackup } = await upgrade();
      const { backup: linkedBackup } = await runUpgrade({ projectRoot: linked, from: v1, to: v2, check: false, force: false });
      if (!mainBackup || !linkedBackup) throw new Error('Expected both backups');
      expect(await undo('--list')).toMatchObject({ report: { backups: [{ name: mainBackup.name }] } });
      expect(await undo('--check', '--backup', linkedBackup.name)).toMatchObject({ report: { blocked: { reason: 'no-backup' } } });
      vi.setSystemTime(new Date('2020-01-16T00:00:00Z'));
      await upgrade(false, false, v1, v2);
      expect(await git('for-each-ref', '--format=%(refname)', mainBackup.ref)).toBe('');
      expect(await git('show-ref', '--verify', linkedBackup.ref)).toContain(linkedBackup.ref);
      const linkedAfter = await projectFiles(linked, true);
      expect(await undo('--yes')).toMatchObject({ code: 0, report: { restored: true } });
      expect(await projectFiles(linked, true)).toEqual(linkedAfter);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a legacy backup without worktree identity restorable', async () => {
    await init();
    const before = await projectFiles(projectRoot, true);
    const { backup } = await upgrade();
    if (!backup) throw new Error('Expected a backup');
    const message = (await git('show', '-s', '--format=%B', backup.ref)).replace(/,"gitDir":"[^"]+"/, '');
    const parents = (await git('show', '-s', '--format=%P', backup.ref)).split(' ');
    const legacy = await git('commit-tree', `${backup.ref}^{tree}`, ...parents.flatMap((parent) => ['-p', parent]), '-m', message);
    await git('update-ref', backup.ref, legacy);
    expect(await undo('--yes', '--backup', backup.name)).toMatchObject({ code: 0, report: { restored: true } });
    expect(await projectFiles(projectRoot, true)).toEqual(before);
  });

  it.skipIf(process.platform === 'win32')('marks a SIGTERM-interrupted CLI apply failed and restores the pre-upgrade files', async () => {
    await init();
    await edit(homePath, 'Fixture footer', 'My unsaved work');
    const before = await projectFiles(projectRoot, true);
    const { build } = await import('unbuild');
    const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
    const outDir = join(parent, 'dist');
    await build(packageRoot, false, { outDir });
    const cli = join(outDir, 'cli.mjs');
    const entry = join(parent, 'nuxt-saas.mjs');
    await writeFile(entry, `import { runMain } from ${JSON.stringify(pathToFileURL(cli).href)}; await runMain();\n`);
    const preload = fileURLToPath(new URL('../support/pauseApply.mjs', import.meta.url));
    const child = spawn(process.execPath, ['--import', preload, entry, 'upgrade', '--dir', projectRoot, '--kit', fixture.root, '--json'], {
      env: { ...process.env, TEST_APPLY_PATH: join(projectRoot, homePath) },
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    const timeout = AbortSignal.timeout(10_000);
    const applying = once(child, 'message', { signal: timeout });
    const exited = once(child, 'exit', { signal: timeout });
    try {
      const [event] = await Promise.race([applying, exited]);
      expect(event, stderr).toBe('applying');
      child.kill('SIGTERM');
      expect(await exited, stderr).toEqual([143, null]);
      expect(await undo('--check')).toMatchObject({ report: { restorable: true, backup: { status: 'failed' } } });
      expect(await readFile(join(projectRoot, homePath), 'utf8')).toContain('Home v2');
      expect(await pathExists(join(projectRoot, 'app/pages/new.vue'))).toBe(false);
      expect(await undo('--yes')).toMatchObject({ code: 0, report: { restored: true } });
      expect(await projectFiles(projectRoot, true)).toEqual(before);
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
  }, 30_000);

  it('requires managed state before comparing commits', async () => {
    await expect(upgrade(true, true, v1)).rejects.toThrow('not a create-nuxt-saas project');
    expect(await pathExists(projectRoot)).toBe(false);
  });
});
