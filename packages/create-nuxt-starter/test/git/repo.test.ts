import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import { assertCleanWorkingTree, isGitRepository, isWorkingTreeClean } from '../../src/git/repo';
import { writeTextFile } from '../../src/util/fs';
import { makeTempDir } from '../support/fixtureKit';
import { editFile, generateProjectAtV1 } from '../support/upgradeFixture';

describe('isGitRepository', () => {
  it('recognises a repository', async () => {
    expect(await isGitRepository(await generateProjectAtV1(['base']))).toBe(true);
  });

  it('rejects a plain directory', async () => {
    expect(await isGitRepository(await makeTempDir('plain'))).toBe(false);
  });
});

describe('isWorkingTreeClean', () => {
  it('is clean straight after a commit', async () => {
    expect(await isWorkingTreeClean(await generateProjectAtV1(['base']))).toBe(true);
  });

  it('is dirty after an edit', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/app.vue', '<template><div>edited</div></template>\n');
    expect(await isWorkingTreeClean(projectRoot)).toBe(false);
  });

  it('is dirty with an untracked file', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await writeTextFile(join(projectRoot, 'untracked.txt'), 'x');
    expect(await isWorkingTreeClean(projectRoot)).toBe(false);
  });
});

describe('assertCleanWorkingTree', () => {
  it('passes on a clean tree', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await expect(assertCleanWorkingTree(projectRoot, { force: false })).resolves.toBeUndefined();
  });

  it('refuses a dirty tree', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/app.vue', 'changed\n');
    await expect(assertCleanWorkingTree(projectRoot, { force: false })).rejects.toThrow(CliError);
  });

  it('allows a dirty tree when forced', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/app.vue', 'changed\n');
    await expect(assertCleanWorkingTree(projectRoot, { force: true })).resolves.toBeUndefined();
  });

  it('refuses a directory that is not a repository', async () => {
    await expect(
      assertCleanWorkingTree(await makeTempDir('plain'), { force: false }),
    ).rejects.toThrow(/not a git repository/i);
  });
});
