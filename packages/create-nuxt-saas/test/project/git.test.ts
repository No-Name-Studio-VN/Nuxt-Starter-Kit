import { execFile } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError } from '../../src/errors';
import { assertCleanTree, initRepository } from '../../src/project/git';
import { pathExists, writeTextFile } from '../../src/util/fs';
import { makeTempDir } from '../support/fixtureKit';

const run = promisify(execFile);
let root: string;
async function git(...args: string[]): Promise<string> {
  const { stdout } = await run('git', ['-C', root, ...args]);
  return stdout.trim();
}

beforeEach(async () => {
  root = await makeTempDir('project-git');
  vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  vi.stubEnv('GIT_AUTHOR_NAME', 'Fixture Author');
  vi.stubEnv('GIT_AUTHOR_EMAIL', 'fixture@example.invalid');
  vi.stubEnv('GIT_COMMITTER_NAME', 'Fixture Author');
  vi.stubEnv('GIT_COMMITTER_EMAIL', 'fixture@example.invalid');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

describe('assertCleanTree', () => {
  it('requires git unless force is given', async () => {
    const checking = assertCleanTree(root, false);
    await expect(checking).rejects.toThrow(CliError);
    await expect(checking).rejects.toThrow('needs git');
    await expect(assertCleanTree(root, true)).resolves.toBeUndefined();
  });

  it('accepts a clean repository and rejects tracked, staged and untracked changes', async () => {
    await writeTextFile(join(root, 'file.txt'), 'initial\n');
    await initRepository(root);
    await expect(assertCleanTree(root, false)).resolves.toBeUndefined();
    await writeTextFile(join(root, 'file.txt'), 'modified\n');
    await expect(assertCleanTree(root, false)).rejects.toThrow('commit or stash');
    await git('add', '-A');
    await expect(assertCleanTree(root, false)).rejects.toThrow('commit or stash');
    await expect(assertCleanTree(root, true)).resolves.toBeUndefined();
    await git('reset', '--hard', 'HEAD');
    await writeTextFile(join(root, 'untracked.txt'), 'new\n');
    await expect(assertCleanTree(root, false)).rejects.toThrow('commit or stash');
  });

  it('ignores dirty files outside the project in a containing work tree', async () => {
    const project = join(root, 'packages/my-app');
    await writeTextFile(join(root, 'other.txt'), 'initial\n');
    await writeTextFile(join(project, 'file.txt'), 'initial\n');
    await initRepository(root);
    await writeTextFile(join(root, 'other.txt'), 'dirty\n');
    await writeTextFile(join(root, 'packages/other-app/untracked.txt'), 'untracked\n');
    await expect(assertCleanTree(project, false)).resolves.toBeUndefined();
  });

  it('still rejects dirty files inside a project nested in a containing work tree', async () => {
    const project = join(root, 'packages/my-app');
    await writeTextFile(join(root, 'other.txt'), 'initial\n');
    await writeTextFile(join(project, 'file.txt'), 'initial\n');
    await initRepository(root);
    await writeTextFile(join(project, 'file.txt'), 'dirty\n');
    await expect(assertCleanTree(project, false)).rejects.toThrow('commit or stash');
  });
});

describe('initRepository', () => {
  it('creates the scaffold commit with all files and no working tree changes', async () => {
    await writeTextFile(join(root, 'file.txt'), 'initial\n');
    await writeTextFile(join(root, '.hidden'), 'hidden\n');
    expect(await initRepository(root)).toBe('committed');
    expect(await git('log', '-1', '--format=%s')).toBe('chore: scaffold with create-nuxt-saas');
    expect(await git('status', '--porcelain')).toBe('');
    expect(await git('ls-files')).toBe('.hidden\nfile.txt');
    expect(await readFile(join(root, '.git/config'), 'utf8')).not.toContain('[user]');
  });

  it('skips initialization inside a containing work tree', async () => {
    await git('init');
    const nested = join(root, 'nested');
    await mkdir(nested);
    await writeTextFile(join(nested, 'file.txt'), 'new\n');
    expect(await initRepository(nested)).toBe('skipped');
    expect(await pathExists(join(nested, '.git'))).toBe(false);
    expect(await git('diff', '--cached', '--name-only')).toBe('');
  });

  it('returns initialised on commit failure without setting an identity', async () => {
    vi.stubEnv('GIT_AUTHOR_NAME', '');
    vi.stubEnv('GIT_COMMITTER_NAME', '');
    await writeTextFile(join(root, 'file.txt'), 'initial\n');
    expect(await initRepository(root)).toBe('initialised');
    expect(await pathExists(join(root, '.git'))).toBe(true);
    expect(await git('diff', '--cached', '--name-only')).toBe('file.txt');
    expect(await readFile(join(root, '.git/config'), 'utf8')).not.toContain('[user]');
  });

  it('disables inherited signing, hooks and init templates without changing user config', async () => {
    const config = join(root, 'global.gitconfig');
    await writeTextFile(
      config,
      '[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = /not-a-signing-program\n[core]\n\thooksPath = ' +
        join(root, 'hooks') +
        '\n[init]\n\ttemplateDir = ' +
        join(root, 'template') +
        '\n',
    );
    await writeTextFile(join(root, 'hooks/pre-commit'), '#!/bin/sh\nexit 1\n');
    await writeTextFile(join(root, 'template/hooks/pre-commit'), '#!/bin/sh\nexit 1\n');
    const { chmod } = await import('node:fs/promises');
    await chmod(join(root, 'hooks/pre-commit'), 0o755);
    await chmod(join(root, 'template/hooks/pre-commit'), 0o755);
    vi.stubEnv('GIT_CONFIG_GLOBAL', config);
    expect(await initRepository(root)).toBe('committed');
    expect(await pathExists(join(root, '.git/hooks/pre-commit'))).toBe(false);
    expect(await git('config', '--global', 'commit.gpgsign')).toBe('true');
  });
});
