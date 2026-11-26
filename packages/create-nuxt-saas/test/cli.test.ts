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
  return {
    ...actual,
    text: vi.fn(),
    multiselect: vi.fn(),
    groupMultiselect: vi.fn(),
    select: vi.fn(),
  };
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
  vi.mocked(prompts.groupMultiselect).mockReset();
  vi.mocked(prompts.select).mockReset();
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
    for (const name of ['init', 'add', 'remove', 'upgrade', 'modules', 'undo']) {
      expect(output()).toContain(name);
    }
  });

  it.each(['--version', '-v'])(
    'prints the package version for %s without running init',
    async (flag) => {
      const pkg = JSON.parse(
        await readFile(new URL('../package.json', import.meta.url), 'utf8'),
      ) as { version: string };
      expect(await main([flag])).toBe(0);
      expect(output().trim()).toBe(pkg.version);
      expect(await readdir(parent)).toEqual([]);
    },
  );

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

  it('explains how to recover a recorded commit missing from a local checkout', async () => {
    await initV1();
    const shallowKit = join(parent, 'shallow-kit');
    await run('git', ['clone', '--depth', '1', `file://${fixture.root}`, shallowKit]);

    expect(await main(['inspect', '--dir', project, '--kit', shallowKit])).toBe(1);
    const error = vi.mocked(console.error).mock.calls.flat().join('\n');
    expect(error).toContain(fixture.v1);
    expect(error).toContain(`is not in the local kit checkout at ${shallowKit}`);
    expect(error).toMatch(/fetch|another clone/i);
    expect(error).not.toMatch(/fatal:|to provide a local checkout/);
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
    expect(output()).toMatch(/New files +[1-9]/);
    expect(await readFile(join(project, '.nuxt-saas.json'), 'utf8')).toBe(before);
    expect(await pathExists(join(project, 'layers/beta'))).toBe(false);
  });

  it('reports conflicts and returns 3 for an overlapping upgrade', async () => {
    await initV1();
    const home = join(project, 'app/pages/index.vue');
    await writeTextFile(home, (await readFile(home, 'utf8')).replace('Home v1', 'User home'));
    expect(await main(['upgrade', '--dir', project, '--force', ...kitArgs()])).toBe(3);
    expect(output()).toContain('Needs your decision');
    expect(output()).toContain('Backup saved');
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

  it('previews conflicts with exit 3 without writing markers or advancing state', async () => {
    await initV1();
    const home = join(project, 'app/pages/index.vue');
    const edited = (await readFile(home, 'utf8')).replace('Home v1', 'User home');
    await writeTextFile(home, edited);
    expect(await main(['upgrade', '--dir', project, '--check', ...kitArgs()])).toBe(3);
    expect(output()).toContain('Preview — nothing was written.');
    expect(output()).toContain('Needs your decision');
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

  it('snapshots the uncommitted kit and records the reachable commit without moving HEAD', async () => {
    await initV1();
    const file = join(fixture.root, 'app/pages/index.vue');
    const original = await readFile(file, 'utf8');
    await writeTextFile(file, original.replace('Home v2', 'Uncommitted kit home'));
    const before = await run('git', ['-C', fixture.root, 'status', '--porcelain=v1']);
    try {
      expect(await main(['upgrade', '--dir', project, ...kitArgs(), '--use-uncommitted-kit'])).toBe(
        0,
      );
      expect(await readFile(join(project, 'app/pages/index.vue'), 'utf8')).toContain(
        'Uncommitted kit home',
      );
      const { commit } = await readState(project);
      const git = (args: string[]) => run('git', ['-C', fixture.root, ...args]);
      expect(
        (await git(['rev-parse', `refs/nuxt-saas/kit-snapshots/${commit}`])).stdout.trim(),
      ).toBe(commit);
      expect((await git(['rev-parse', `${commit}^`, 'HEAD'])).stdout.trim().split('\n')).toEqual([
        fixture.v2,
        fixture.v2,
      ]);
      expect((await git(['status', '--porcelain=v1'])).stdout).toBe(before.stdout);
    } finally {
      await writeTextFile(file, original);
    }
  });

  it('rejects an uncommitted kit snapshot without --kit or with --to', async () => {
    await initV1();
    expect(await main(['upgrade', '--dir', project, '--use-uncommitted-kit'])).toBe(1);
    expect(
      await main([
        'upgrade',
        '--dir',
        project,
        ...kitArgs(),
        '--to',
        'HEAD',
        '--use-uncommitted-kit',
      ]),
    ).toBe(1);
    expect((await readState(project)).commit).toBe(fixture.v1);
  });

  it('accepts --no-backup and reports no backup for undo', async () => {
    await initV1();
    expect(await main(['upgrade', '--dir', project, ...kitArgs(), '--no-backup'])).toBe(0);
    expect(output()).not.toContain('Backup saved');
    expect(await main(['undo', '--dir', project, '--yes'])).toBe(1);
  });

  it('reports exit 3 for a conflicting module add preview and apply', async () => {
    expect(await main(['init', project, '--yes', ...kitArgs()])).toBe(0);
    await writeTextFile(join(project, 'layers/alpha/app/pages/alpha.vue'), 'my alpha\n');
    expect(await main(['add', 'alpha', '--dir', project, ...kitArgs(), '--check'])).toBe(3);
    expect(await main(['add', 'alpha', '--dir', project, ...kitArgs(), '--force'])).toBe(3);
    expect(await main(['undo', '--dir', project, '--yes'])).toBe(0);
    expect(await readFile(join(project, 'layers/alpha/app/pages/alpha.vue'), 'utf8')).toBe(
      'my alpha\n',
    );
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

  it('shows group headings in kit order and indents children below their parent', async () => {
    expect(await main(['modules', ...kitArgs()])).toBe(0);
    expect(
      output()
        .split('\n')
        .map((line) => line.split(' — ')[0]),
    ).toEqual([
      'Foundation:',
      '  storage',
      'App:',
      '  access',
      '    access-key',
      '    access-link',
      '  alpha',
      '    beta',
      'Content:',
      '  docs',
      'server-core [internal]',
    ]);
  });

  it('lists and changes modules at a recorded snapshot without groups', async () => {
    await initV1();
    expect(await main(['add', 'access,beta', '--dir', project, ...kitArgs()])).toBe(0);
    expect(await main(['modules', '--dir', project, ...kitArgs()])).toBe(0);
    expect(output()).toMatch(/^access \[installed\]/m);
    expect(output()).not.toMatch(/^App:/m);
    expect(await main(['remove', 'access,beta', '--dir', project, '--force', ...kitArgs()])).toBe(
      0,
    );
    expect(await readState(project)).toMatchObject({ commit: fixture.v1, modules: ['alpha'] });
  });

  it('refuses to initialize without choosing one of the required modules', async () => {
    const target = join(parent, 'not-created', 'app');
    expect(await main(['init', target, '--modules', 'access', ...kitArgs()])).toBe(1);
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain(
      'access needs at least one of access-key, access-link.',
    );
    expect(await readdir(parent)).toEqual([]);
  });

  it('refuses to add a module without one of its required choices', async () => {
    expect(await main(['init', project, '--yes', ...kitArgs()])).toBe(0);
    expect(await main(['add', 'access', '--dir', project, ...kitArgs()])).toBe(1);
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain(
      'access needs at least one of access-key, access-link.',
    );
    expect((await readState(project)).modules).toEqual([]);
    expect(await pathExists(join(project, 'layers/access'))).toBe(false);
  });

  it('refuses to remove the last required choice', async () => {
    expect(await main(['init', project, '--modules', 'access-key', ...kitArgs()])).toBe(0);
    expect(await main(['remove', 'access-key', '--dir', project, ...kitArgs()])).toBe(1);
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain(
      "Can't remove access-key: access needs at least one of access-key, access-link.",
    );
    expect((await readState(project)).modules).toEqual(['access', 'access-key']);
    expect(await pathExists(join(project, 'layers/access-key/module.json'))).toBe(true);
  });

  it('prunes an orphaned internal module but keeps its edited files', async () => {
    expect(await main(['init', project, '--modules', 'storage', ...kitArgs()])).toBe(0);
    expect((await readState(project)).modules).toEqual(['server-core', 'storage']);
    const edited = 'layers/server-core/server/utils/core.ts';
    await writeTextFile(join(project, edited), 'user code\n');
    expect(await main(['remove', 'storage', '--dir', project, '--force', ...kitArgs()])).toBe(0);
    expect((await readState(project)).modules).toEqual([]);
    expect(await pathExists(join(project, 'layers/server-core/module.json'))).toBe(false);
    expect(await readFile(join(project, edited), 'utf8')).toBe('user code\n');
    expect(output()).toContain('Kept your version');
    expect(output()).toContain(`    ${edited}`);
  });

  it('refuses a same-major upgrade when the existing selection lacks a required choice', async () => {
    await initV1();
    expect(await main(['add', 'access', '--dir', project, ...kitArgs()])).toBe(0);
    expect(await main(['upgrade', '--dir', project, '--force', ...kitArgs()])).toBe(1);
    expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain(
      'access needs at least one of access-key, access-link.',
    );
    expect((await readState(project)).commit).toBe(fixture.v1);
    expect(await pathExists(join(project, 'app/pages/new.vue'))).toBe(false);
  });

  it('refuses a major upgrade without changing the project tree', async () => {
    const majorKit = await createFixtureKit({ nextMajor: true });
    try {
      await initV1();
      expect(await main(['upgrade', '--dir', project, '--kit', majorKit.root])).toBe(1);
      expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain(
        'This project was generated with kit 3.x and cannot upgrade to kit 4.x. Generate a new project and move your code across.',
      );
      expect((await readState(project)).commit).toBe(fixture.v1);
      expect((await run('git', ['-C', project, 'status', '--porcelain'])).stdout).toBe('');
    } finally {
      await rm(majorKit.root, { recursive: true, force: true });
    }
  });

  it('does not write a kit snapshot or project backup for a cross-major upgrade', async () => {
    await initV1();
    const packagePath = join(fixture.root, 'package.json');
    const original = await readFile(packagePath, 'utf8');
    const refs = () =>
      run('git', ['-C', fixture.root, 'for-each-ref', 'refs/nuxt-saas/kit-snapshots/']);
    const before = (await refs()).stdout;
    try {
      await writeTextFile(packagePath, original.replace('3.1.0', '4.0.0'));
      expect(
        await main(['upgrade', '--dir', project, ...kitArgs(), '--use-uncommitted-kit', '--force']),
      ).toBe(1);
      expect(vi.mocked(console.error).mock.calls.flat().join('\n')).toContain(
        'kit 3.x and cannot upgrade to kit 4.x',
      );
      expect((await refs()).stdout).toBe(before);
      expect(
        (await run('git', ['-C', project, 'for-each-ref', 'refs/nuxt-saas/backups/'])).stdout,
      ).toBe('');
      expect((await readState(project)).commit).toBe(fixture.v1);
    } finally {
      await writeTextFile(packagePath, original);
    }
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
    vi.mocked(prompts.groupMultiselect).mockResolvedValue(prompts.CANCEL_SYMBOL);
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
    vi.mocked(prompts.groupMultiselect).mockResolvedValue(['beta']);
    vi.mocked(prompts.select).mockResolvedValue('create');
    expect(await main(kitArgs())).toBe(0);
    expect((await readState(join(parent, 'prompted-app'))).modules).toEqual(['alpha', 'beta']);
    expect(output()).toMatch(/alpha.*required by beta/i);
  });

  it('shows an invalid selection and lets the user choose again before creating the project', async () => {
    vi.spyOn(process.stdin, 'isTTY', 'get').mockReturnValue(true);
    vi.mocked(prompts.groupMultiselect)
      .mockResolvedValueOnce(['access'])
      .mockImplementationOnce(async ({ initialValues }) => {
        expect(initialValues).toEqual(['access']);
        return ['access', 'access-link'];
      });
    vi.mocked(prompts.select)
      .mockImplementationOnce(async ({ options }) => {
        expect(await pathExists(project)).toBe(false);
        expect(options.map(({ value }) => value)).not.toContain('create');
        return 'back';
      })
      .mockResolvedValueOnce('create');
    expect(await main(['init', project, ...kitArgs()])).toBe(0);
    expect(output()).toContain('access needs at least one of access-key, access-link.');
    expect((await readState(project)).modules).toEqual(['access', 'access-link']);
  });

  it('returns only explicit choices to the picker when going back from a valid review', async () => {
    vi.spyOn(process.stdin, 'isTTY', 'get').mockReturnValue(true);
    vi.mocked(prompts.groupMultiselect)
      .mockResolvedValueOnce(['beta'])
      .mockImplementationOnce(async ({ initialValues }) => {
        expect(initialValues).toEqual(['beta']);
        return [];
      });
    vi.mocked(prompts.select)
      .mockImplementationOnce(async () => {
        expect(await pathExists(project)).toBe(false);
        return 'back';
      })
      .mockResolvedValueOnce('create');
    expect(await main(['init', project, ...kitArgs()])).toBe(0);
    expect((await readState(project)).modules).toEqual([]);
  });

  it('offers legacy ungrouped internals in the grouped picker', async () => {
    vi.spyOn(process.stdin, 'isTTY', 'get').mockReturnValue(true);
    vi.mocked(prompts.groupMultiselect).mockImplementation(async ({ options }) => {
      expect(Object.keys(options)).toEqual([' Foundation', ' App', ' Content', ' Ungrouped']);
      expect(options[' App']).toContainEqual(
        expect.objectContaining({ value: 'beta', label: '  Beta' }),
      );
      return options[' Ungrouped']?.map(({ value }) => value) ?? [];
    });
    vi.mocked(prompts.select).mockResolvedValue('create');
    expect(await main(['init', project, ...kitArgs()])).toBe(0);
    expect((await readState(project)).modules).toEqual(['server-core']);
    expect(output()).toMatch(/server-core.*legacy internal/i);
  });

  it('cancels from review without writing a project', async () => {
    vi.spyOn(process.stdin, 'isTTY', 'get').mockReturnValue(true);
    vi.mocked(prompts.groupMultiselect).mockResolvedValue(['beta']);
    vi.mocked(prompts.select).mockResolvedValue(prompts.CANCEL_SYMBOL);
    expect(await main(['init', project, ...kitArgs()])).toBe(0);
    expect(output()).toContain('Cancelled.');
    expect(await pathExists(project)).toBe(false);
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
    const home = join(project, 'app/pages/index.vue');
    await writeTextFile(home, (await readFile(home, 'utf8')).replace('Home v1', 'User home'));
    expect(await main(['upgrade', '--dir', project, ...kitArgs()])).toBe(1);
    for (const result of opened.mock.results) {
      const snapshot = await result.value;
      expect(await pathExists(snapshot.dir)).toBe(false);
    }
  });
});
