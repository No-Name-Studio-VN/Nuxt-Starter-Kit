import { lstat, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import { applyPlan } from '../../src/transition/apply';
import { planTransition } from '../../src/transition/plan';
import type { Tree } from '../../src/render/render';
import { pathExists, writeTextFile } from '../../src/util/fs';
import { makeTempDir } from '../support/fixtureKit';

let root: string;
let outside: string;
beforeEach(async () => {
  root = await makeTempDir('apply-project');
  outside = await makeTempDir('apply-outside');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

describe('applyPlan', () => {
  it('writes each content-bearing kind and creates parent directories', async () => {
    await writeTextFile(join(root, 'update.txt'), 'old');
    await applyPlan(root, {
      changes: [
        { path: 'a/b/create.bin', kind: 'create', content: Buffer.from([0, 1, 2]) },
        { path: 'update.txt', kind: 'update', content: Buffer.from('new\n') },
        { path: 'merge.txt', kind: 'merge', content: Buffer.from('merged\r\n') },
        { path: 'conflict.txt', kind: 'conflict', content: Buffer.from('<<<<<<< yours\n') },
      ],
    });
    expect(await readFile(join(root, 'a/b/create.bin'))).toEqual(Buffer.from([0, 1, 2]));
    expect(await readFile(join(root, 'update.txt'), 'utf8')).toBe('new\n');
    expect(await readFile(join(root, 'merge.txt'), 'utf8')).toBe('merged\r\n');
    expect(await readFile(join(root, 'conflict.txt'), 'utf8')).toBe('<<<<<<< yours\n');
  });

  it('does not write keep-edited or keep-protected changes even with content', async () => {
    await writeTextFile(join(root, 'edited.txt'), 'mine');
    await writeTextFile(join(root, 'content/x.md'), 'protected');
    await applyPlan(root, {
      changes: [
        { path: 'edited.txt', kind: 'keep-edited', content: Buffer.from('bad') },
        { path: 'content/x.md', kind: 'keep-protected', content: Buffer.from('bad') },
        { path: 'missing.txt', kind: 'keep-edited' },
      ],
    });
    expect(await readFile(join(root, 'edited.txt'), 'utf8')).toBe('mine');
    expect(await readFile(join(root, 'content/x.md'), 'utf8')).toBe('protected');
    expect(await pathExists(join(root, 'missing.txt'))).toBe(false);
  });

  it('deletes a file and prunes a/b without deleting projectRoot', async () => {
    await writeTextFile(join(root, 'a/b/file.txt'), 'old');
    await applyPlan(root, { changes: [{ path: 'a/b/file.txt', kind: 'delete' }] });
    expect(await pathExists(join(root, 'a'))).toBe(false);
    expect((await lstat(root)).isDirectory()).toBe(true);
  });

  it('stops pruning at a non-empty parent', async () => {
    await writeTextFile(join(root, 'a/b/file.txt'), 'old');
    await writeTextFile(join(root, 'a/keep.txt'), 'mine');
    await applyPlan(root, { changes: [{ path: 'a/b/file.txt', kind: 'delete' }] });
    expect(await pathExists(join(root, 'a/b'))).toBe(false);
    expect(await readFile(join(root, 'a/keep.txt'), 'utf8')).toBe('mine');
  });

  it.each(['directory', 'file', 'dangling'])(
    'rejects writing through a %s symlink',
    async (kind) => {
      await writeTextFile(join(outside, 'file.txt'), 'outside');
      const path = kind === 'directory' ? 'linked/file.txt' : 'file.txt';
      await symlink(
        kind === 'directory'
          ? outside
          : join(outside, kind === 'dangling' ? 'missing' : 'file.txt'),
        join(root, kind === 'directory' ? 'linked' : 'file.txt'),
      );
      const applying = applyPlan(root, {
        changes: [{ path, kind: 'update', content: Buffer.from('bad') }],
      });
      await expect(applying).rejects.toThrow(CliError);
      await expect(applying).rejects.toThrow('symbolic link');
      expect(await readFile(join(outside, 'file.txt'), 'utf8')).toBe('outside');
      expect(await pathExists(join(outside, 'missing'))).toBe(false);
    },
  );

  it('plans and applies updates through a symlinked project root', async () => {
    const linkedRoot = join(root, 'linked-root');
    await symlink(outside, linkedRoot);
    await writeTextFile(join(outside, 'file.txt'), 'old\n');
    const base: Tree = new Map([['file.txt', { content: Buffer.from('old\n'), binary: false }]]);
    const target: Tree = new Map([
      ['file.txt', { content: Buffer.from('new\n'), binary: false }],
      ['nested/created.txt', { content: Buffer.from('created\n'), binary: false }],
    ]);
    const plan = await planTransition(linkedRoot, base, target);
    expect(plan).toEqual({
      changes: [
        { path: 'file.txt', kind: 'update', content: Buffer.from('new\n') },
        { path: 'nested/created.txt', kind: 'create', content: Buffer.from('created\n') },
      ],
    });
    await applyPlan(linkedRoot, plan);
    expect(await readFile(join(outside, 'file.txt'), 'utf8')).toBe('new\n');
    expect(await readFile(join(outside, 'nested/created.txt'), 'utf8')).toBe('created\n');
    expect((await lstat(linkedRoot)).isSymbolicLink()).toBe(true);
  });

  it('rejects deletion through symlinked directories', async () => {
    await writeTextFile(join(outside, 'file.txt'), 'outside');
    await symlink(outside, join(root, 'linked'));
    await expect(
      applyPlan(root, { changes: [{ path: 'linked/file.txt', kind: 'delete' }] }),
    ).rejects.toThrow('symbolic link');
    expect(await readFile(join(outside, 'file.txt'), 'utf8')).toBe('outside');
  });

  it.each(['../escaped.txt', '.', '/absolute.txt'])(
    'rejects unsafe destination %s',
    async (path) => {
      await expect(
        applyPlan(root, { changes: [{ path, kind: 'create', content: Buffer.from('bad') }] }),
      ).rejects.toThrow(CliError);
    },
  );

  it('rejects write changes with no content rather than truncating files', async () => {
    await writeTextFile(join(root, 'file.txt'), 'mine');
    await expect(
      applyPlan(root, { changes: [{ path: 'file.txt', kind: 'update' }] }),
    ).rejects.toThrow(CliError);
    expect(await readFile(join(root, 'file.txt'), 'utf8')).toBe('mine');
  });

  it('does not recursively remove a user directory', async () => {
    await mkdir(join(root, 'file.txt'));
    await writeTextFile(join(root, 'file.txt/mine'), 'mine');
    await expect(
      applyPlan(root, { changes: [{ path: 'file.txt', kind: 'delete' }] }),
    ).rejects.toThrow();
    expect(await readFile(join(root, 'file.txt/mine'), 'utf8')).toBe('mine');
  });
});
