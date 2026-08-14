import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeFiles } from '../../src/git/mergeFile';
import { writeTextFile } from '../../src/util/fs';
import { makeTempDir } from '../support/fixtureKit';

const labels = { ours: 'local', base: 'base', theirs: 'upstream' };

async function scenario(base: string, ours: string, theirs: string) {
  const root = await makeTempDir('merge');
  const paths = {
    basePath: join(root, 'base'),
    oursPath: join(root, 'ours'),
    theirsPath: join(root, 'theirs'),
  };
  await writeTextFile(paths.basePath, base);
  await writeTextFile(paths.oursPath, ours);
  await writeTextFile(paths.theirsPath, theirs);
  return mergeFiles({ ...paths, labels });
}

describe('mergeFiles', () => {
  it('merges non-overlapping edits cleanly', async () => {
    const result = await scenario('a\nb\nc\n', 'MINE\nb\nc\n', 'a\nb\nTHEIRS\n');
    expect(result.status).toBe('clean');
    expect(result.content).toBe('MINE\nb\nTHEIRS\n');
  });

  it('keeps upstream changes when the user changed nothing', async () => {
    const result = await scenario('a\nb\n', 'a\nb\n', 'a\nB2\n');
    expect(result.status).toBe('clean');
    expect(result.content).toBe('a\nB2\n');
  });

  it('reports overlapping edits as conflicts with markers', async () => {
    const result = await scenario('a\nb\nc\n', 'a\nMINE\nc\n', 'a\nTHEIRS\nc\n');
    expect(result.status).toBe('conflict');
    if (result.status !== 'conflict') return;
    expect(result.conflicts).toBe(1);
    expect(result.content).toContain('<<<<<<< local');
    expect(result.content).toContain('||||||| base');
    expect(result.content).toContain('>>>>>>> upstream');
  });
});
