import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import {
  hashContent,
  listFiles,
  pathExists,
  pruneEmptyDirectories,
  readTextFile,
  writeJsonAtomically,
  writeTextFile,
} from '../../src/util/fs';

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'nsk-fs-'));
});

describe('listFiles', () => {
  it('lists nested files as sorted posix paths', async () => {
    await writeTextFile(join(root, 'b.txt'), 'b');
    await writeTextFile(join(root, 'app/a.vue'), 'a');
    expect(await listFiles(root)).toEqual(['app/a.vue', 'b.txt']);
  });

  it('rejects symlinks', async () => {
    await writeTextFile(join(root, 'real.txt'), 'x');
    await symlink(join(root, 'real.txt'), join(root, 'link.txt'));
    await expect(listFiles(root)).rejects.toThrow(CliError);
  });
});

describe('readTextFile', () => {
  it('returns null for binary content', async () => {
    await writeFile(join(root, 'bin'), Buffer.from([0x41, 0x00, 0x42]));
    expect(await readTextFile(join(root, 'bin'))).toBeNull();
  });

  it('returns text content', async () => {
    await writeTextFile(join(root, 'a.txt'), 'hello');
    expect(await readTextFile(join(root, 'a.txt'))).toBe('hello');
  });
});

describe('pathExists', () => {
  it('reports presence', async () => {
    await writeTextFile(join(root, 'a.txt'), 'x');
    expect(await pathExists(join(root, 'a.txt'))).toBe(true);
    expect(await pathExists(join(root, 'missing.txt'))).toBe(false);
  });
});

describe('writeJsonAtomically', () => {
  it('writes pretty JSON with a trailing newline', async () => {
    const target = join(root, 'nested/manifest.json');
    await writeJsonAtomically(target, { a: 1 });
    expect(await readFile(target, 'utf8')).toBe('{\n  "a": 1\n}\n');
  });
});

describe('pruneEmptyDirectories', () => {
  it('removes the directory and its emptied parents', async () => {
    await writeTextFile(join(root, 'server/api/flags/index.get.ts'), 'x');
    await rm(join(root, 'server/api/flags/index.get.ts'));

    await pruneEmptyDirectories(root, join(root, 'server/api/flags'));

    expect(await pathExists(join(root, 'server'))).toBe(false);
  });

  it('stops at a parent that still holds something', async () => {
    await writeTextFile(join(root, 'server/utils/db.ts'), 'x');
    await writeTextFile(join(root, 'server/api/flags/index.get.ts'), 'x');
    await rm(join(root, 'server/api/flags/index.get.ts'));

    await pruneEmptyDirectories(root, join(root, 'server/api/flags'));

    expect(await pathExists(join(root, 'server/api'))).toBe(false);
    expect(await pathExists(join(root, 'server/utils/db.ts'))).toBe(true);
  });

  it('never removes the project root', async () => {
    await pruneEmptyDirectories(root, root);
    expect(await pathExists(root)).toBe(true);
  });
});

describe('hashContent', () => {
  it('is stable and prefixed', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'));
    expect(hashContent('abc')).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hashContent('abc')).not.toBe(hashContent('abd'));
  });
});
