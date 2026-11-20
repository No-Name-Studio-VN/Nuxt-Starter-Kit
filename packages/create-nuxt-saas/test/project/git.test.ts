import { execFile } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initRepository } from '../../src/project/git';
import { assessUnsaved } from '../../src/project/unsaved';
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

describe('assessUnsaved', () => {
  it('returns null outside git', async () => {
    expect(await assessUnsaved(root, [])).toBeNull();
  });

  it('classifies staged renames, touched, protected and unrelated paths under the project prefix', async () => {
    const project = join(root, 'packages/my-app');
    const original = 'original name.txt';
    const renamed = 'new name.txt';
    await writeTextFile(join(project, original), 'original\n');
    await writeTextFile(join(project, 'merge.txt'), 'original\n');
    await writeTextFile(join(project, 'protected.txt'), 'original\n');
    await writeTextFile(join(project, '.gitignore'), 'ignored.txt\n');
    await initRepository(root);
    await git('mv', '--', `packages/my-app/${original}`, `packages/my-app/${renamed}`);
    await writeTextFile(join(project, 'merge.txt'), 'dirty\n');
    await writeTextFile(join(project, 'protected.txt'), 'dirty\n');
    await writeTextFile(join(project, 'ignored.txt'), 'ignore me\n');
    await writeTextFile(join(root, 'outside.txt'), 'outside\n');
    expect(await assessUnsaved(project, [
      { path: original, kind: 'keep-edited' },
      { path: renamed, kind: 'conflict' },
      { path: 'merge.txt', kind: 'merge' },
      { path: 'protected.txt', kind: 'keep-protected' },
      { path: 'ignored.txt', kind: 'conflict' },
    ])).toEqual({ total: 4, risky: [{ path: renamed, kind: 'conflict' }, { path: original, kind: 'keep-edited' }], touched: ['merge.txt'], untouched: 1 });
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
