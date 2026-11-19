import { execFile } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../src/cli';
import { readState } from '../src/project/state';
import type {
  JsonErrorReport,
  JsonInspectReport,
  JsonModulesReport,
  JsonTransitionReport,
} from '../src/types/json';
import { writeTextFile } from '../src/util/fs';
import { createFixtureKit, makeTempDir } from './support/fixtureKit';

const run = promisify(execFile);
let fixture: Awaited<ReturnType<typeof createFixtureKit>>;
let parent: string;
let project: string;
const originalCwd = process.cwd();
const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');

beforeAll(async () => {
  fixture = await createFixtureKit();
});
afterAll(async () => {
  await rm(fixture.root, { recursive: true, force: true });
});
beforeEach(async () => {
  parent = await makeTempDir('json');
  project = join(parent, 'project');
  process.chdir(parent);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.defineProperty(process.stdin, 'isTTY', { configurable: true, get: () => false });
  vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  vi.stubEnv('GIT_AUTHOR_NAME', 'Fixture Author');
  vi.stubEnv('GIT_AUTHOR_EMAIL', 'fixture@example.invalid');
  vi.stubEnv('GIT_COMMITTER_NAME', 'Fixture Author');
  vi.stubEnv('GIT_COMMITTER_EMAIL', 'fixture@example.invalid');
});
afterEach(async () => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (ttyDescriptor) Object.defineProperty(process.stdin, 'isTTY', ttyDescriptor);
  else Reflect.deleteProperty(process.stdin, 'isTTY');
  await rm(parent, { recursive: true, force: true });
});

function captureStdout() {
  return vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
}
function written(spy: ReturnType<typeof captureStdout>): string {
  return spy.mock.calls.map(([chunk]) => String(chunk)).join('');
}
function parseJson(text: string): unknown {
  return JSON.parse(text);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
async function initV1(extraArgs: string[] = []): Promise<void> {
  await run('git', ['-C', fixture.root, 'checkout', '--detach', fixture.v1]);
  try {
    expect(await main(['init', project, '--yes', '--kit', fixture.root, ...extraArgs])).toBe(0);
  } finally {
    await run('git', ['-C', fixture.root, 'checkout', 'main']);
  }
}

describe('--json output', () => {
  it('prints only a JSON transition report for upgrade --check --json', async () => {
    await initV1();
    vi.mocked(console.log).mockClear();
    const stdout = captureStdout();
    const code = await main([
      'upgrade',
      '--dir',
      project,
      '--check',
      '--json',
      '--kit',
      fixture.root,
      '--to',
      fixture.v2,
    ]);
    // An untouched project has nothing to conflict with, so a preview exits 0.
    expect(code).toBe(0);
    const text = written(stdout);
    expect(text.endsWith('\n')).toBe(true);
    const report = parseJson(text);
    expect(isRecord(report)).toBe(true);
    if (!isRecord(report)) return;
    expect(report).toMatchObject({
      schema: 1,
      from: fixture.v1,
      to: fixture.v2,
      applied: false,
    } satisfies Partial<JsonTransitionReport>);
    expect(Array.isArray(report.changes)).toBe(true);
    if (!Array.isArray(report.changes)) return;
    expect(report.changes.length).toBeGreaterThan(0);
    for (const change of report.changes) {
      expect(Object.keys(change).sort()).toEqual(['kind', 'path']);
    }
    expect(console.log).not.toHaveBeenCalled();
  });

  it('add --json applies the change and reports from and to as the recorded kit commit', async () => {
    await initV1();
    const state = await readState(project);
    expect(state.modules).not.toContain('beta');
    vi.mocked(console.log).mockClear();
    const stdout = captureStdout();

    expect(await main(['add', 'beta', '--json', '--dir', project, '--kit', fixture.root])).toBe(0);

    const text = written(stdout);
    expect(text.endsWith('\n')).toBe(true);
    const report: unknown = parseJson(text);
    expect(report).toMatchObject({
      schema: 1,
      from: state.commit,
      to: state.commit,
      conflicts: [],
      addedModules: expect.arrayContaining(['beta']),
      removedModules: [],
      applied: true,
    } satisfies Partial<JsonTransitionReport>);
    const changes = isRecord(report) ? report.changes : undefined;
    expect(Array.isArray(changes)).toBe(true);
    if (!Array.isArray(changes)) return;
    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) expect(Object.keys(change).sort()).toEqual(['kind', 'path']);
    expect(console.log).not.toHaveBeenCalled();
    expect((await readState(project)).modules).toContain('beta');
  });

  it('remove --json reports the removed modules and what was written', async () => {
    await initV1(['--modules', 'beta']);
    const state = await readState(project);
    expect(state.modules).toContain('beta');
    vi.mocked(console.log).mockClear();
    const stdout = captureStdout();

    expect(await main(['remove', 'beta', '--json', '--dir', project, '--kit', fixture.root])).toBe(
      0,
    );

    const report: unknown = parseJson(written(stdout));
    expect(report).toMatchObject({
      schema: 1,
      from: state.commit,
      to: state.commit,
      conflicts: [],
      addedModules: [],
      removedModules: ['beta'],
      applied: true,
    } satisfies Partial<JsonTransitionReport>);
    const changes = isRecord(report) ? report.changes : undefined;
    expect(Array.isArray(changes) && changes.length > 0).toBe(true);
    expect(console.log).not.toHaveBeenCalled();
    expect((await readState(project)).modules).not.toContain('beta');
  });

  it('upgrade --json reports upToDate when the project already is at the target', async () => {
    await initV1();
    vi.mocked(console.log).mockClear();
    const stdout = captureStdout();

    expect(
      await main([
        'upgrade',
        '--dir',
        project,
        '--json',
        '--kit',
        fixture.root,
        '--to',
        fixture.v1,
        '--check',
      ]),
    ).toBe(0);

    const report: unknown = parseJson(written(stdout));
    expect(report).toEqual({
      schema: 1,
      from: fixture.v1,
      to: fixture.v1,
      changes: [],
      conflicts: [],
      followUps: [],
      addedModules: [],
      removedModules: [],
      applied: false,
      upToDate: true,
    } satisfies JsonTransitionReport);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('an applied upgrade with conflicts exits 1 and still prints exactly one JSON report', async () => {
    await initV1();
    const home = join(project, 'app/pages/index.vue');
    await writeFile(home, (await readFile(home, 'utf8')).replace('Home v1', 'User home'));
    await run('git', ['-C', project, 'commit', '-am', 'customize home']);
    vi.mocked(console.log).mockClear();
    const stdout = captureStdout();

    const code = await main([
      'upgrade',
      '--dir',
      project,
      '--json',
      '--kit',
      fixture.root,
      '--to',
      fixture.v2,
    ]);

    expect(code).toBe(1);
    const text = written(stdout);
    expect(text.endsWith('\n')).toBe(true);
    // One document: the whole output parses as a single JSON value and the schema key appears once.
    expect(text.match(/"schema"/g)).toHaveLength(1);
    const report: unknown = parseJson(text);
    expect(report).toMatchObject({
      schema: 1,
      from: fixture.v1,
      to: fixture.v2,
      conflicts: ['app/pages/index.vue'],
      applied: true,
      upToDate: false,
    } satisfies Partial<JsonTransitionReport>);
    expect(console.log).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect((await readState(project)).conflicts).toEqual(['app/pages/index.vue']);
  });

  it('prints a JSON error for a CliError', async () => {
    const emptyDir = join(parent, 'empty');
    await run('mkdir', [emptyDir]);
    const stdout = captureStdout();
    expect(await main(['upgrade', '--dir', emptyDir, '--json'])).toBe(1);
    const report: unknown = parseJson(written(stdout));
    expect(report).toMatchObject({ schema: 1, error: { kind: 'expected' } });
    const message = isRecord(report) && isRecord(report.error) ? report.error.message : undefined;
    expect(String(message)).toContain('not a create-nuxt-saas project');
    expect(console.error).not.toHaveBeenCalled();
  });

  it('prints a JSON error with kind unexpected and exit 2 for other failures', async () => {
    const source = await import('../src/kit/source');
    vi.spyOn(source, 'resolveCommit').mockRejectedValue(new Error('boom'));
    const stdout = captureStdout();
    expect(await main(['init', project, '--yes', '--json', '--kit', fixture.root])).toBe(2);
    expect(parseJson(written(stdout))).toEqual({
      schema: 1,
      error: { message: 'boom', kind: 'unexpected' } satisfies JsonErrorReport['error'],
    });
  });

  it('prints JSON for unknown flags', async () => {
    const stdout = captureStdout();
    await main(['upgrade', '--json', '--bogus-flag']);
    const text = written(stdout);
    const report: unknown = parseJson(text);
    expect(isRecord(report)).toBe(true);
    expect(report).toMatchObject({ schema: 1, error: { kind: 'expected' } });
  });

  it('keeps human output without --json', async () => {
    await initV1();
    expect(
      await main([
        'upgrade',
        '--dir',
        project,
        '--check',
        '--kit',
        fixture.root,
        '--to',
        fixture.v2,
      ]),
    ).toBe(0);
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toContain(
      'Preview — nothing was written.',
    );
  });

  it('still shows normal help with --json', async () => {
    const stdout = captureStdout();
    expect(await main(['upgrade', '--json', '--help'])).toBe(0);
    expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toContain('USAGE');
    expect(written(stdout)).toBe('');
  });

  it('modules --json outside a project lists claims at --to', async () => {
    const emptyDir = join(parent, 'empty');
    await run('mkdir', [emptyDir]);
    const stdout = captureStdout();
    expect(
      await main([
        'modules',
        '--json',
        '--kit',
        fixture.root,
        '--to',
        fixture.v1,
        '--dir',
        emptyDir,
      ]),
    ).toBe(0);
    const report: unknown = parseJson(written(stdout));
    expect(report).toMatchObject({
      schema: 1,
      commit: fixture.v1,
      groups: [],
      installed: [],
    } satisfies Partial<JsonModulesReport>);
    const modules = isRecord(report) ? report.modules : undefined;
    expect(Array.isArray(modules)).toBe(true);
    if (!Array.isArray(modules)) return;
    expect(modules.find((module) => isRecord(module) && module.id === 'alpha')).toMatchObject({
      dependencies: expect.arrayContaining(['alpha-dep']),
    });
    expect(console.log).not.toHaveBeenCalled();
  });

  it('modules --json includes groups in kit order, parent and selection rules', async () => {
    const stdout = captureStdout();
    expect(await main(['modules', '--json', '--kit', fixture.root, '--dir', parent])).toBe(0);
    expect(parseJson(written(stdout))).toMatchObject({
      schema: 1,
      groups: ['Foundation', 'App', 'Content'],
      modules: expect.arrayContaining([
        expect.objectContaining({
          id: 'access',
          group: 'App',
          parent: null,
          requiresOneOf: ['access-key', 'access-link'],
        }),
        expect.objectContaining({
          id: 'access-key',
          group: 'App',
          parent: 'access',
          requiresOneOf: [],
        }),
        expect.objectContaining({
          id: 'server-core',
          group: null,
          parent: null,
          requiresOneOf: [],
        }),
      ]),
    });
  });

  it('modules --to is rejected inside a project', async () => {
    await initV1();
    const stdout = captureStdout();
    expect(
      await main([
        'modules',
        '--dir',
        project,
        '--to',
        fixture.v2,
        '--kit',
        fixture.root,
        '--json',
      ]),
    ).toBe(1);
    const report: unknown = parseJson(written(stdout));
    expect(report).toMatchObject({ schema: 1, error: { kind: 'expected' } });
    const message = isRecord(report) && isRecord(report.error) ? report.error.message : undefined;
    expect(String(message)).toContain('--to');
  });

  it('modules --json inside a project uses the recorded commit', async () => {
    await initV1();
    const state = await readState(project);
    const stdout = captureStdout();
    expect(await main(['modules', '--json', '--dir', project, '--kit', fixture.root])).toBe(0);
    const report: unknown = parseJson(written(stdout));
    expect(report).toMatchObject({
      schema: 1,
      commit: state.commit,
      installed: state.modules,
    } satisfies Partial<JsonModulesReport>);
  });

  it('inspect --json reports the summary at the recorded commit', async () => {
    await initV1();
    vi.mocked(console.log).mockClear();
    const stdout = captureStdout();
    expect(await main(['inspect', '--json', '--dir', project, '--kit', fixture.root])).toBe(0);
    const report: unknown = parseJson(written(stdout));
    expect(report).toMatchObject({
      schema: 1,
      commit: fixture.v1,
    } satisfies Partial<JsonInspectReport>);
    expect(report).toMatchObject({ summary: { edited: 0, deleted: 0, scoredChanged: 0 } });
    const files = isRecord(report) ? report.files : undefined;
    expect(Array.isArray(files)).toBe(true);
    if (!Array.isArray(files)) return;
    expect(files.length).toBeGreaterThan(0);
    expect(console.log).not.toHaveBeenCalled();
  });

  it('inspect --added inventories only project additions visible to git', async () => {
    await initV1();
    const args = ['inspect', '--dir', project, '--kit', fixture.root];
    const stdout = captureStdout();
    expect(await main([...args, '--json'])).toBe(0);
    const baseline = written(stdout);
    const baselineReport = parseJson(baseline);
    const baselineSummary = isRecord(baselineReport) ? baselineReport.summary : undefined;
    if (!isRecord(baselineSummary)) throw new Error('Expected an inspect summary');
    expect(baselineSummary).not.toHaveProperty('added');

    const tracked = 'content/tracked post.md';
    const untracked = 'untracked file.txt';
    const excluded = [
      'ignored.txt',
      '.env.production',
      '.envrc',
      'server/db/migrations/0001_fixture.sql',
      'pnpm-lock.yaml',
      '.nuxt/types.d.ts',
      '.output/server/index.mjs',
      'local/node_modules/fixture/package.json',
      '.data/local.db',
    ];
    await writeTextFile(join(project, '.git/info/exclude'), 'ignored.txt\n');
    const deleted = 'removed.txt';
    for (const path of [tracked, untracked, deleted, ...excluded]) {
      await writeTextFile(join(project, path), 'fixture\n');
    }
    await run('git', [
      '-C',
      project,
      'add',
      '--force',
      '--',
      tracked,
      deleted,
      ...excluded.slice(1),
    ]);
    await rm(join(project, deleted));

    stdout.mockClear();
    expect(await main([...args, '--json'])).toBe(0);
    expect(written(stdout)).toBe(baseline);

    stdout.mockClear();
    expect(await main([...args, '--json', '--added'])).toBe(0);
    const report = parseJson(written(stdout));
    expect(report).toMatchObject({
      summary: {
        added: 2,
        scored: baselineSummary.scored,
        scoredChanged: baselineSummary.scoredChanged,
      },
    });
    const files = isRecord(report) ? report.files : undefined;
    if (!Array.isArray(files)) throw new Error('Expected inspect files');
    expect(files.filter((file: unknown) => isRecord(file) && file.status === 'added')).toEqual([
      { path: tracked, status: 'added', layer: 'base', expected: false },
      { path: untracked, status: 'added', layer: 'base', expected: false },
    ]);

    vi.mocked(console.log).mockClear();
    expect(await main([...args, '--added'])).toBe(0);
    expect(vi.mocked(console.log).mock.calls.slice(-3)).toEqual([
      ['Added:'],
      [`  ${tracked}`],
      [`  ${untracked}`],
    ]);
  });
});
