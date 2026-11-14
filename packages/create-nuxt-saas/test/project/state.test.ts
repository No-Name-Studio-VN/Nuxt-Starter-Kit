import { lstat, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import {
  readState,
  STATE_FILE,
  unresolvedConflicts,
  writeState,
  type ProjectState,
} from '../../src/project/state';
import { writeTextFile } from '../../src/util/fs';
import { makeTempDir } from '../support/fixtureKit';

let root: string;
const state: ProjectState = {
  version: 3,
  kit: 'github:example/kit',
  commit: 'a'.repeat(40),
  modules: ['beta', 'alpha'],
  identity: { name: 'my-app', description: 'My project' },
  conflicts: [],
};

beforeEach(async () => {
  root = await makeTempDir('state');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('project state', () => {
  it('round-trips deterministic v3 JSON with sorted modules and stable key order', async () => {
    await writeState(root, state);
    expect(STATE_FILE).toBe('.nuxt-saas.json');
    const expected = {
      version: 3,
      kit: 'github:example/kit',
      commit: 'a'.repeat(40),
      modules: ['alpha', 'beta'],
      identity: { name: 'my-app', description: 'My project' },
      conflicts: [],
    };
    expect(await readState(root)).toEqual(expected);
    const first = await readFile(join(root, STATE_FILE), 'utf8');
    expect(first).toBe(`${JSON.stringify(expected, null, 2)}\n`);
    await writeState(root, {
      conflicts: [],
      identity: { description: 'My project', name: 'my-app' },
      modules: ['alpha', 'beta'],
      commit: state.commit,
      kit: state.kit,
      version: 3,
    });
    expect(await readFile(join(root, STATE_FILE), 'utf8')).toBe(first);
    expect(state.modules).toEqual(['beta', 'alpha']);
  });

  it('rejects legacy projects with the exact migration guidance', async () => {
    await writeTextFile(join(root, '.nuxt-saas/manifest.json'), '{}');
    const reading = readState(root);
    await expect(reading).rejects.toThrow(CliError);
    await expect(reading).rejects.toMatchObject({
      message:
        'This project was created by create-nuxt-saas 2.x, which this version cannot manage. Generate a new project with `npm create nuxt-saas@latest` and move your code across.',
    });
  });

  it('prefers v3 state when a legacy manifest is also present', async () => {
    await writeTextFile(join(root, '.nuxt-saas/manifest.json'), '{}');
    await writeState(root, state);
    expect((await readState(root)).version).toBe(3);
  });

  it('reports a directory with neither state file as not a project', async () => {
    await expect(readState(root)).rejects.toThrow(CliError);
    await expect(readState(root)).rejects.toThrow('not a create-nuxt-saas project');
  });

  it.each([
    '{invalid',
    'null',
    '{}',
    JSON.stringify({ ...state, version: 2 }),
    JSON.stringify({ ...state, commit: 'short' }),
    JSON.stringify({ ...state, modules: [1] }),
    JSON.stringify({ ...state, identity: { name: 'app' } }),
    JSON.stringify({ ...state, conflicts: ['../outside'] }),
  ])('names the state file when rejecting invalid input %s', async (input) => {
    await writeFile(join(root, STATE_FILE), input);
    const reading = readState(root);
    await expect(reading).rejects.toThrow(CliError);
    await expect(reading).rejects.toThrow('.nuxt-saas.json');
  });

  it('does not follow the state file symlink when reading or writing', async () => {
    const outside = join(root, 'outside.json');
    const contents = `${JSON.stringify(state)}\n`;
    await writeFile(outside, contents);
    await symlink(outside, join(root, STATE_FILE));
    await expect(readState(root)).rejects.toThrow(CliError);
    await expect(writeState(root, state)).rejects.toThrow(CliError);
    expect(await readFile(outside, 'utf8')).toBe(contents);
    expect((await lstat(join(root, STATE_FILE))).isSymbolicLink()).toBe(true);
  });
});

describe('unresolvedConflicts', () => {
  it('returns only listed files still containing a line beginning with an opening marker', async () => {
    await writeTextFile(
      join(root, 'open.txt'),
      'intro\n<<<<<<< yours\nlocal\n=======\nkit\n>>>>>>> kit\n',
    );
    await writeTextFile(join(root, 'crlf.txt'), 'intro\r\n<<<<<<< yours\r\n');
    await writeTextFile(
      join(root, 'resolved.txt'),
      'text <<<<<<< inline\n <<<<<<< indented\n<<<<<<<\n>>>>>>> kit\n',
    );
    await writeTextFile(join(root, 'unlisted.txt'), '<<<<<<< yours\n');
    expect(
      await unresolvedConflicts(root, {
        ...state,
        conflicts: ['open.txt', 'resolved.txt', 'deleted.txt', 'crlf.txt'],
      }),
    ).toEqual(['open.txt', 'crlf.txt']);
  });

  it('does not inspect conflict files through symlinks', async () => {
    await writeTextFile(join(root, 'outside/file.txt'), '<<<<<<< yours\n');
    await symlink(join(root, 'outside'), join(root, 'linked'));
    await expect(
      unresolvedConflicts(root, { ...state, conflicts: ['linked/file.txt'] }),
    ).rejects.toThrow(CliError);
  });

  it('refuses conflict paths outside the project', async () => {
    await expect(
      unresolvedConflicts(root, { ...state, conflicts: ['../outside'] }),
    ).rejects.toThrow(CliError);
  });
});
