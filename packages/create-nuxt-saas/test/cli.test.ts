import { execFile } from 'node:child_process';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import * as prompts from '@clack/prompts';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../src/cli';
import { CliError } from '../src/errors';
import * as source from '../src/kit/source';
import { readState } from '../src/project/state';
import { pathExists, writeTextFile } from '../src/util/fs';
import { createFixtureKit, makeTempDir } from './support/fixtureKit';

vi.mock('@clack/prompts', async (importOriginal) => {
  const actual = await importOriginal<typeof prompts>();
  return { ...actual, text: vi.fn(), multiselect: vi.fn() };
});

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
  parent = await makeTempDir('cli');
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
  vi.mocked(prompts.text).mockReset();
  vi.mocked(prompts.multiselect).mockReset();
  await rm(parent, { recursive: true, force: true });
});

function output(): string {
  return vi.mocked(console.log).mock.calls.flat().join('\n');
}
function kitArgs(): string[] {
  return ['--kit', fixture.root];
}
async function initV1(): Promise<void> {
  await run('git', ['-C', fixture.root, 'checkout', '--detach', fixture.v1]);
  try {
    expect(await main(['init', project, '--yes', ...kitArgs()])).toBe(0);
  } finally {
    await run('git', ['-C', fixture.root, 'checkout', 'main']);
  }
}

describe('CLI routing and commands', () => {
  it('initializes a base-only project with an explicit init subcommand', async () => {
    expect(await main(['init', project, '--yes', ...kitArgs()])).toBe(0);
    expect((await readState(project)).modules).toEqual([]);
    expect(await pathExists(join(project, '.git'))).toBe(true);
    expect(await pathExists(join(project, 'layers/alpha'))).toBe(false);
    expect(output()).toContain(project);
    expect(output()).toContain('pnpm install');
  });

  it('routes a directory invocation to init without running it twice', async () => {
    expect(await main(['my-app', '--yes', ...kitArgs()])).toBe(0);
    expect((await readState(join(parent, 'my-app'))).modules).toEqual([]);
  });

  it('routes flags-only argv to init with the default name', async () => {
    expect(await main(['--yes', ...kitArgs()])).toBe(0);
    expect((await readState(join(parent, 'my-nuxt-app'))).modules).toEqual([]);
  });

  it('routes empty argv to init and accepts cancellation at the name prompt', async () => {
    vi.spyOn(source, 'resolveCommit').mockResolvedValue(fixture.v2);
    const realOpen = source.openKit;
    const opened = vi
      .spyOn(source, 'openKit')
      .mockImplementation((_source, commit, template) =>
        realOpen({ kind: 'local', path: fixture.root, allowDirty: false }, commit, template),
      );
    vi.mocked(prompts.text).mockResolvedValue(prompts.CANCEL_SYMBOL);
    expect(await main([])).toBe(0);
    expect(output()).toContain('Cancelled.');
    expect(await readdir(parent)).toEqual([]);
    const snapshot = await opened.mock.results[0]?.value;
    expect(snapshot).toBeDefined();
    if (snapshot) expect(await pathExists(snapshot.dir)).toBe(false);
  });

  it('lists root commands without fetching a kit', async () => {
    expect(await main(['--help'])).toBe(0);
    for (const name of ['init', 'add', 'remove', 'upgrade', 'modules']) {
      expect(output()).toContain(name);
    }
  });

  it.each(['init', 'add', 'remove', 'modules'])(
    'shows help for %s without running it',
    async (command) => {
      expect(await main([command, '-h'])).toBe(0);
      expect(output()).toContain('USAGE');
      expect(output()).toContain(command);
      expect(await readdir(parent)).toEqual([]);
    },
  );

  it('returns a user-facing error for missing required modules', async () => {
    expect(await main(['add'])).toBe(1);
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain(
      'Missing required positional argument',
    );
  });

  it('shows upgrade-specific help', async () => {
    expect(await main(['upgrade', '--help'])).toBe(0);
    expect(output()).toContain('--to');
    expect(output()).toContain('--template');
    expect(output()).not.toContain('--modules');
  });

  it('splits and trims module flags, dropping empty entries', async () => {
    expect(await main(['init', project, '--modules', ' beta, , ', '--no-git', ...kitArgs()])).toBe(
      0,
    );
    expect((await readState(project)).modules).toEqual(['alpha', 'beta']);
    expect(await pathExists(join(project, '.git'))).toBe(false);
  });

  it('treats an explicitly empty modules flag as base only', async () => {
    expect(await main(['init', project, '--modules', '', ...kitArgs()])).toBe(0);
    expect((await readState(project)).modules).toEqual([]);
  });

  it('uses base only without modules in a non-TTY', async () => {
    expect(await main(['init', project, ...kitArgs()])).toBe(0);
    expect((await readState(project)).modules).toEqual([]);
  });

  it('adds beta with its dependency and removes beta via subcommands', async () => {
    expect(await main(['init', project, '--yes', ...kitArgs()])).toBe(0);
    expect(await main(['add', 'beta', '--dir', project, ...kitArgs()])).toBe(0);
    expect((await readState(project)).modules).toEqual(['alpha', 'beta']);
    expect(output()).toContain('Next:');
    expect(await main(['remove', 'beta', '--dir', project, '--force', ...kitArgs()])).toBe(0);
    expect((await readState(project)).modules).toEqual(['alpha']);
  });

  it('prints preview reports without changing state or files', async () => {
    expect(await main(['init', project, '--yes', ...kitArgs()])).toBe(0);
    const before = await readFile(join(project, '.nuxt-saas.json'), 'utf8');
    expect(await main(['add', 'beta', '--dir', project, '--check', ...kitArgs()])).toBe(0);
    expect(output()).toContain('Preview — nothing was written.');
    expect(output()).toContain('layers/beta/server/db/schema.sqlite.ts');
    expect(await readFile(join(project, '.nuxt-saas.json'), 'utf8')).toBe(before);
    expect(await pathExists(join(project, 'layers/beta'))).toBe(false);
  });

  it('reports conflicts and returns 1 for an overlapping upgrade', async () => {
    await initV1();
    const home = join(project, 'app/pages/index.vue');
    await writeTextFile(home, (await readFile(home, 'utf8')).replace('Home v1', 'User home'));
    expect(await main(['upgrade', '--dir', project, '--force', ...kitArgs()])).toBe(1);
    expect(output()).toContain('Conflicts:');
    expect(output()).toContain('app/pages/index.vue');
    expect(await readFile(home, 'utf8')).toContain('<<<<<<< yours');
    expect((await readState(project)).commit).toBe(fixture.v2);
  });

  it('resolves a local --to ref and records an upgrade template override', async () => {
    await initV1();
    expect(
      await main([
        'upgrade',
        '--dir',
        project,
        '--to',
        fixture.v2,
        '--template',
        'github:fork/repo#custom',
        ...kitArgs(),
      ]),
    ).toBe(0);
    expect(await readState(project)).toMatchObject({
      commit: fixture.v2,
      kit: 'github:fork/repo#custom',
    });
  });

  it('uses the recorded commit rather than local HEAD when adding modules', async () => {
    await initV1();
    expect(await main(['add', 'beta', '--dir', project, ...kitArgs()])).toBe(0);
    expect(await readFile(join(project, 'layers/alpha/app/pages/alpha.vue'), 'utf8')).toContain(
      'Alpha v1',
    );
    expect((await readState(project)).commit).toBe(fixture.v1);
  });

  it('honors a local --to ref that differs from HEAD', async () => {
    expect(await main(['init', project, '--yes', ...kitArgs()])).toBe(0);
    expect(await main(['upgrade', '--dir', project, '--to', fixture.v1, ...kitArgs()])).toBe(0);
    expect((await readState(project)).commit).toBe(fixture.v1);
    expect(await readFile(join(project, 'app/pages/index.vue'), 'utf8')).toContain('Home v1');
    expect(await pathExists(join(project, 'app/pages/new.vue'))).toBe(false);
  });

  it('refuses unavailable local refs with a user-facing error', async () => {
    expect(await main(['init', project, '--yes', ...kitArgs()])).toBe(0);
    expect(await main(['upgrade', '--dir', project, '--to', 'missing-ref', ...kitArgs()])).toBe(1);
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain(
      'Unable to resolve local kit ref',
    );
  });

  it('previews conflicts with exit 1 without writing markers or advancing state', async () => {
    await initV1();
    const home = join(project, 'app/pages/index.vue');
    const edited = (await readFile(home, 'utf8')).replace('Home v1', 'User home');
    await writeTextFile(home, edited);
    expect(await main(['upgrade', '--dir', project, '--check', ...kitArgs()])).toBe(1);
    expect(output()).toContain('Preview — nothing was written.');
    expect(output()).toContain('Conflicts:');
    expect(await readFile(home, 'utf8')).toBe(edited);
    expect((await readState(project)).commit).toBe(fixture.v1);
  });

  it('requires --allow-dirty-kit for a dirty local source', async () => {
    await writeTextFile(join(fixture.root, 'untracked.txt'), 'dirty');
    try {
      expect(await main(['init', project, '--yes', ...kitArgs()])).toBe(1);
      expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain('--allow-dirty-kit');
      expect(await main(['init', project, '--yes', ...kitArgs(), '--allow-dirty-kit'])).toBe(0);
      expect(await pathExists(join(project, 'untracked.txt'))).toBe(false);
    } finally {
      await rm(join(fixture.root, 'untracked.txt'));
    }
  });

  it('reads modules at the recorded commit and marks installed modules', async () => {
    expect(await main(['init', project, '--modules', 'beta', ...kitArgs()])).toBe(0);
    expect(await main(['modules', '--dir', project, ...kitArgs()])).toBe(0);
    expect(output()).toMatch(/alpha.*installed/);
    expect(output()).toMatch(/beta.*installed/);
    expect(output()).toContain('docs');
  });

  it('lists modules outside a project from a local kit', async () => {
    expect(await main(['modules', ...kitArgs()])).toBe(0);
    expect(output()).toContain('Alpha');
    expect(output()).toContain('Beta');
  });

  it('treats unknown commands as init directories but refuses non-empty targets', async () => {
    await writeTextFile(join(parent, 'typo', 'keep.txt'), 'user data');
    expect(await main(['typo', '--yes', ...kitArgs()])).toBe(1);
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain('not empty');
    expect(await readFile(join(parent, 'typo', 'keep.txt'), 'utf8')).toBe('user data');
  });

  it('prints unexpected error stacks and returns 2', async () => {
    vi.spyOn(source, 'resolveCommit').mockRejectedValue(new Error('unexpected failure'));
    expect(await main(['init', project, '--yes', ...kitArgs()])).toBe(2);
    const error = vi.mocked(console.error).mock.calls.flat().join('\n');
    expect(error).toContain('Error: unexpected failure');
    expect(error).toContain('cli.test.ts');
  });
});

describe('interactive prompts and snapshot cleanup', () => {
  it('cancels the module picker without writing a project and cleans its snapshot', async () => {
    vi.spyOn(process.stdin, 'isTTY', 'get').mockReturnValue(true);
    vi.mocked(prompts.multiselect).mockResolvedValue(prompts.CANCEL_SYMBOL);
    const opened = vi.spyOn(source, 'openKit');
    expect(await main(['init', project, ...kitArgs()])).toBe(0);
    expect(output()).toContain('Cancelled.');
    expect(await pathExists(project)).toBe(false);
    const snapshot = await opened.mock.results[0]?.value;
    expect(snapshot).toBeDefined();
    if (snapshot) expect(await pathExists(snapshot.dir)).toBe(false);
  });

  it('uses prompted name and module selection', async () => {
    vi.spyOn(process.stdin, 'isTTY', 'get').mockReturnValue(true);
    vi.mocked(prompts.text).mockResolvedValue('prompted-app');
    vi.mocked(prompts.multiselect).mockResolvedValue(['beta']);
    expect(await main(kitArgs())).toBe(0);
    expect((await readState(join(parent, 'prompted-app'))).modules).toEqual(['alpha', 'beta']);
  });

  it('cleans the old snapshot if opening the target kit fails', async () => {
    await initV1();
    const realOpen = source.openKit;
    const opened = vi
      .spyOn(source, 'openKit')
      .mockImplementationOnce(realOpen)
      .mockRejectedValueOnce(new CliError('Target kit unavailable'));
    expect(await main(['upgrade', '--dir', project, ...kitArgs()])).toBe(1);
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain(
      'Target kit unavailable',
    );
    const snapshot = await opened.mock.results[0]?.value;
    expect(snapshot).toBeDefined();
    if (snapshot) expect(await pathExists(snapshot.dir)).toBe(false);
  });

  it('cleans both snapshots on an upgrade failure', async () => {
    await initV1();
    const opened = vi.spyOn(source, 'openKit');
    await writeTextFile(join(project, 'user.txt'), 'dirty');
    expect(await main(['upgrade', '--dir', project, ...kitArgs()])).toBe(1);
    for (const result of opened.mock.results) {
      const snapshot = await result.value;
      expect(await pathExists(snapshot.dir)).toBe(false);
    }
  });
});
