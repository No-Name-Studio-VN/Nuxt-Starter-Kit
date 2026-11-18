import { execFile } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../src/cli';
import { readState } from '../src/project/state';
import type { JsonErrorReport, JsonModulesReport, JsonTransitionReport } from '../src/types/json';
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
async function initV1(): Promise<void> {
  await run('git', ['-C', fixture.root, 'checkout', '--detach', fixture.v1]);
  try {
    expect(await main(['init', project, '--yes', '--kit', fixture.root])).toBe(0);
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
    expect([0, 1]).toContain(code);
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
});
