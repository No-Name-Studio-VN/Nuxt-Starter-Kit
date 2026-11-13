import { lstat, mkdir, readFile, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError } from '../../src/errors';
import * as mergeModule from '../../src/git/mergeFile';
import { DEFAULT_TEMPLATE, openKit } from '../../src/kit/source';
import { render, type Tree } from '../../src/render/render';
import { applyPlan } from '../../src/transition/apply';
import { planTransition } from '../../src/transition/plan';
import { isProtected } from '../../src/transition/protected';
import { listFiles, pathExists, writeTextFile } from '../../src/util/fs';
import { createFixtureKit, makeTempDir } from '../support/fixtureKit';

let root: string;
let outside: string;
beforeEach(async () => {
  root = await makeTempDir('transition-project');
  outside = await makeTempDir('transition-outside');
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

function tree(content?: string | Buffer, path = 'file.txt', binary = false): Tree {
  return new Map(content === undefined ? [] : [[path, { content: Buffer.from(content), binary }]]);
}

async function temporaryMerges(): Promise<string[]> {
  return (await readdir(tmpdir())).filter((name) => name.startsWith('nsk-transition-')).sort();
}

describe('planTransition rule table', () => {
  it.each([undefined, 'old\n', 'edited\n', Buffer.from([0, 1])])(
    'row 1: omits unchanged upstream files regardless of user content (%s)',
    async (user) => {
      if (user !== undefined) await writeTextFile(join(root, 'file.txt'), user.toString());
      expect(await planTransition(root, tree('old\n'), tree('old\n'))).toEqual({ changes: [] });
    },
  );

  it('row 2: creates a new upstream file when absent locally', async () => {
    expect(await planTransition(root, null, tree('new\n'))).toEqual({
      changes: [{ path: 'file.txt', kind: 'create', content: Buffer.from('new\n') }],
    });
    expect(await readdir(root)).toEqual([]);
  });

  it.each(['new\n', 'new\r\n'])('row 3: omits an identical new user file (%s)', async (user) => {
    await writeTextFile(join(root, 'file.txt'), user);
    expect(await planTransition(root, null, tree('new\n'))).toEqual({ changes: [] });
  });

  it('row 4: merges a new file over an empty base', async () => {
    await writeTextFile(join(root, 'file.txt'), '');
    expect(await planTransition(root, null, tree('new\n'))).toEqual({
      changes: [{ path: 'file.txt', kind: 'merge', content: Buffer.from('new\n') }],
    });
  });

  it('row 4: conflicts rather than overwriting a different new user file', async () => {
    await writeTextFile(join(root, 'file.txt'), 'mine\n');
    const plan = await planTransition(root, null, tree('new\n'));
    expect(plan.changes).toEqual([
      { path: 'file.txt', kind: 'conflict', content: expect.any(Buffer) },
    ]);
    expect(plan.changes[0]?.content?.toString()).toContain('<<<<<<< yours\nmine\n');
    expect(plan.changes[0]?.content?.toString()).toContain('||||||| kit (old)\n=======\n');
    expect(plan.changes[0]?.content?.toString()).toContain('>>>>>>> kit (new)');
  });

  it('row 4: keeps a binary new-file collision', async () => {
    await writeTextFile(join(root, 'file.txt'), 'mine\n');
    expect(await planTransition(root, null, tree(Buffer.from([0, 2]), 'file.txt', true))).toEqual({
      changes: [{ path: 'file.txt', kind: 'keep-edited' }],
    });
  });

  it.each([false, true])('row 5: updates an untouched file (binary=%s)', async (binary) => {
    await writeTextFile(join(root, 'file.txt'), 'old\n');
    expect(
      await planTransition(
        root,
        tree('old\n', 'file.txt', binary),
        tree('new\n', 'file.txt', binary),
      ),
    ).toEqual({
      changes: [{ path: 'file.txt', kind: 'update', content: Buffer.from('new\n') }],
    });
  });

  it('row 6 / review focus 1: preserves a user deletion when upstream changed', async () => {
    const plan = await planTransition(root, tree('old\n'), tree('new\n'));
    expect(plan).toEqual({ changes: [{ path: 'file.txt', kind: 'keep-edited' }] });
    await applyPlan(root, plan);
    expect(await readdir(root)).toEqual([]);
  });

  it('row 7: merges non-overlapping edits', async () => {
    await writeTextFile(join(root, 'file.txt'), 'mine\nb\nc\n');
    expect(await planTransition(root, tree('a\nb\nc\n'), tree('a\nb\nnew\n'))).toEqual({
      changes: [{ path: 'file.txt', kind: 'merge', content: Buffer.from('mine\nb\nnew\n') }],
    });
  });

  it('row 7: emits all three labels for overlapping edits', async () => {
    await writeTextFile(join(root, 'file.txt'), 'mine\n');
    const plan = await planTransition(root, tree('old\n'), tree('new\n'));
    expect(plan.changes).toEqual([
      { path: 'file.txt', kind: 'conflict', content: expect.any(Buffer) },
    ]);
    expect(plan.changes[0]?.content?.toString()).toBe(
      '<<<<<<< yours\nmine\n||||||| kit (old)\nold\n=======\nnew\n>>>>>>> kit (new)\n',
    );
  });

  it.each([true, false])(
    'row 7: keeps binary edits detected from render or user bytes (%s)',
    async (binary) => {
      await writeTextFile(join(root, 'file.txt'), binary ? 'mine\n' : '\0mine');
      expect(await planTransition(root, tree('old\n', 'file.txt', binary), tree('new\n'))).toEqual({
        changes: [{ path: 'file.txt', kind: 'keep-edited' }],
      });
    },
  );

  it.each(['old\n', 'old\r\n'])('row 8: deletes an untouched removed file (%s)', async (user) => {
    await writeTextFile(join(root, 'file.txt'), user);
    expect(await planTransition(root, tree('old\n'), tree())).toEqual({
      changes: [{ path: 'file.txt', kind: 'delete' }],
    });
  });

  it('row 9: keeps an edited removed file', async () => {
    await writeTextFile(join(root, 'file.txt'), 'mine\n');
    expect(await planTransition(root, tree('old\n'), tree())).toEqual({
      changes: [{ path: 'file.txt', kind: 'keep-edited' }],
    });
  });

  it('row 9: omits an already absent removed file', async () => {
    expect(await planTransition(root, tree('old\n'), tree())).toEqual({ changes: [] });
  });
});

describe('line endings, purity and ordering', () => {
  it('review focus 2: treats a CRLF copy of base as untouched', async () => {
    await writeTextFile(join(root, 'file.txt'), 'old\r\n');
    expect(await planTransition(root, tree('old\n'), tree('new\n'))).toEqual({
      changes: [{ path: 'file.txt', kind: 'update', content: Buffer.from('new\n') }],
    });
  });

  it.each(['merge', 'conflict'])('preserves user CRLF in %s output', async (kind) => {
    await writeTextFile(join(root, 'file.txt'), 'mine\r\nb\r\nc\r\n');
    const target = kind === 'merge' ? 'a\nb\nnew\n' : 'new\nb\nc\n';
    const plan = await planTransition(root, tree('a\nb\nc\n'), tree(target));
    expect(plan.changes[0]?.kind).toBe(kind);
    const content = plan.changes[0]?.content?.toString();
    expect(content).toContain('mine\r\n');
    expect(content?.replaceAll('\r\n', '')).not.toContain('\n');
  });

  it('omits upstream changes that only normalize line endings', async () => {
    expect(await planTransition(root, tree('old\r\n'), tree('old\n'))).toEqual({ changes: [] });
  });

  it('compares binary content byte-for-byte rather than normalizing it', async () => {
    await writeTextFile(join(root, 'file.txt'), '\0old\r\n');
    expect(
      await planTransition(
        root,
        tree('\0old\n', 'file.txt', true),
        tree('\0new\n', 'file.txt', true),
      ),
    ).toEqual({
      changes: [{ path: 'file.txt', kind: 'keep-edited' }],
    });
  });

  it('sorts all changed paths and ignores user-only files', async () => {
    await writeTextFile(join(root, 'user-only.txt'), 'mine');
    const target: Tree = new Map([...tree('z', 'z.txt'), ...tree('a', 'a.txt')]);
    expect((await planTransition(root, null, target)).changes.map((change) => change.path)).toEqual(
      ['a.txt', 'z.txt'],
    );
  });

  it('does not modify the project, input trees or leave merge temp files', async () => {
    await writeTextFile(join(root, 'file.txt'), 'mine\nb\nc\n');
    const base = tree('a\nb\nc\n');
    const target = tree('a\nb\nnew\n');
    const before = await lstat(join(root, 'file.txt'));
    const temps = await temporaryMerges();
    await planTransition(root, base, target);
    expect(await listFiles(root)).toEqual(['file.txt']);
    expect(await readFile(join(root, 'file.txt'), 'utf8')).toBe('mine\nb\nc\n');
    expect((await lstat(join(root, 'file.txt'))).mtimeMs).toBe(before.mtimeMs);
    expect(base).toEqual(tree('a\nb\nc\n'));
    expect(target).toEqual(tree('a\nb\nnew\n'));
    expect(await temporaryMerges()).toEqual(temps);
  });

  it('cleans merge temp files when git merging fails', async () => {
    await writeTextFile(join(root, 'file.txt'), 'mine\n');
    const temps = await temporaryMerges();
    vi.spyOn(mergeModule, 'mergeFiles').mockRejectedValueOnce(new CliError('git failed'));
    await expect(planTransition(root, tree('old\n'), tree('new\n'))).rejects.toThrow('git failed');
    expect(await temporaryMerges()).toEqual(temps);
    expect(await readFile(join(root, 'file.txt'), 'utf8')).toBe('mine\n');
  });
});

describe('protected paths', () => {
  it.each([
    '.env',
    '.env.local',
    '.env.example.local',
    '.env.production',
    'server/db/migrations/0001.sql',
    'server/db/migrations/meta/journal.json',
    'pnpm-lock.yaml',
    'package-lock.json',
    'yarn.lock',
    'bun.lockb',
    'content/x.md',
    'content/blog/x.md',
    '.nuxt-saas.json',
  ])('recognizes protected path %s', (path) => expect(isProtected(path)).toBe(true));
  it.each([
    '.env.example',
    'app/.env',
    'content-other/x.md',
    'app/content/x.md',
    'server/db/migrations-other/x.sql',
    'app/pnpm-lock.yaml',
    '.nuxt-saas.json.backup',
  ])('does not protect ordinary path %s', (path) => expect(isProtected(path)).toBe(false));

  it('creates absent protected content', async () => {
    expect(await planTransition(root, null, tree('new\n', 'content/x.md'))).toEqual({
      changes: [{ path: 'content/x.md', kind: 'create', content: Buffer.from('new\n') }],
    });
  });

  it.each(['mine\n', 'old\n'])(
    'keeps existing protected content instead of merging or updating (%s)',
    async (user) => {
      await writeTextFile(join(root, 'content/x.md'), user);
      expect(
        await planTransition(root, tree('old\n', 'content/x.md'), tree('new\n', 'content/x.md')),
      ).toEqual({
        changes: [{ path: 'content/x.md', kind: 'keep-protected' }],
      });
    },
  );

  it('keeps protected content on an init collision', async () => {
    await writeTextFile(join(root, 'content/x.md'), 'mine\n');
    expect(await planTransition(root, null, tree('new\n', 'content/x.md'))).toEqual({
      changes: [{ path: 'content/x.md', kind: 'keep-protected' }],
    });
  });

  it('never deletes untouched protected content', async () => {
    await writeTextFile(join(root, 'content/x.md'), 'old\n');
    expect(await planTransition(root, tree('old\n', 'content/x.md'), tree())).toEqual({
      changes: [{ path: 'content/x.md', kind: 'keep-protected' }],
    });
  });

  it.each(['old\n', 'new\n'])(
    'keeps deleted protected content absent when upstream content is %s',
    async (targetContent) => {
      const plan = await planTransition(
        root,
        tree('old\n', 'content/x.md'),
        tree(targetContent, 'content/x.md'),
      );
      expect(plan).toEqual({ changes: [] });
      await applyPlan(root, plan);
      expect(await pathExists(join(root, 'content/x.md'))).toBe(false);
    },
  );

  it('creates protected content introduced by an added module', async () => {
    const base = tree('base\n', 'app/app.vue');
    const target: Tree = new Map([...base, ...tree('sample\n', 'content/x.md')]);
    const plan = await planTransition(root, base, target);
    expect(plan).toEqual({
      changes: [{ path: 'content/x.md', kind: 'create', content: Buffer.from('sample\n') }],
    });
    await applyPlan(root, plan);
    expect(await readFile(join(root, 'content/x.md'), 'utf8')).toBe('sample\n');
  });

  it('creates new upstream protected content during an upgrade', async () => {
    const base = tree('v1\n', 'version.txt');
    const target: Tree = new Map([
      ...tree('v2\n', 'version.txt'),
      ...tree('sample\n', 'content/new.md'),
    ]);
    await writeTextFile(join(root, 'version.txt'), 'v1\n');
    const plan = await planTransition(root, base, target);
    expect(plan).toEqual({
      changes: [
        { path: 'content/new.md', kind: 'create', content: Buffer.from('sample\n') },
        { path: 'version.txt', kind: 'update', content: Buffer.from('v2\n') },
      ],
    });
    await applyPlan(root, plan);
    expect(await readFile(join(root, 'content/new.md'), 'utf8')).toBe('sample\n');
    expect(await readFile(join(root, 'version.txt'), 'utf8')).toBe('v2\n');
  });

  it('omits identical existing protected content', async () => {
    await writeTextFile(join(root, 'content/x.md'), 'new\n');
    expect(await planTransition(root, null, tree('new\n', 'content/x.md'))).toEqual({
      changes: [],
    });
  });
});

describe('safe project reads', () => {
  it.each(['file', 'directory', 'dangling'])('never follows a %s symlink', async (kind) => {
    const path = kind === 'directory' ? 'linked/file.txt' : 'file.txt';
    await writeTextFile(join(outside, 'file.txt'), 'old\n');
    await symlink(
      kind === 'directory' ? outside : join(outside, kind === 'dangling' ? 'missing' : 'file.txt'),
      join(root, kind === 'directory' ? 'linked' : 'file.txt'),
    );
    expect(await planTransition(root, tree('old\n', path), tree('new\n', path))).toEqual({
      changes: [{ path, kind: 'keep-edited' }],
    });
    expect(await readFile(join(outside, 'file.txt'), 'utf8')).toBe('old\n');
  });

  it('keeps a user directory where the kit expects a file', async () => {
    await mkdir(join(root, 'file.txt'));
    expect(await planTransition(root, tree('old\n'), tree('new\n'))).toEqual({
      changes: [{ path: 'file.txt', kind: 'keep-edited' }],
    });
  });

  it('rejects a tree path outside the project', async () => {
    await expect(planTransition(root, null, tree('bad', '../outside.txt'))).rejects.toThrow(
      CliError,
    );
    expect(await pathExists(join(root, 'outside.txt'))).toBe(false);
  });
});

describe('render integration', () => {
  it('plans and applies init, add, upgrade and remove using fixture renders', async () => {
    const fixture = await createFixtureKit();
    const source = { kind: 'local', path: fixture.root, allowDirty: false } satisfies Parameters<
      typeof openKit
    >[0];
    const oldKit = await openKit(source, fixture.v1, DEFAULT_TEMPLATE);
    const newKit = await openKit(source, fixture.v2, DEFAULT_TEMPLATE);
    try {
      const identity = { name: 'my-app', description: 'My project' };
      const base = await render(oldKit, [], identity);
      const added = await render(oldKit, ['alpha'], identity);
      const upgraded = await render(newKit, ['alpha'], identity);
      await applyPlan(root, await planTransition(root, null, base));
      await applyPlan(root, await planTransition(root, base, added));
      expect(await pathExists(join(root, 'layers/alpha/module.json'))).toBe(true);
      await applyPlan(root, await planTransition(root, added, upgraded));
      expect(await readFile(join(root, 'app/pages/index.vue'), 'utf8')).toContain('Home v2');
      expect(await readFile(join(root, 'layers/alpha/app/pages/alpha.vue'), 'utf8')).toContain(
        'Alpha v2',
      );
      const removed = await render(newKit, [], identity);
      await applyPlan(root, await planTransition(root, upgraded, removed));
      expect(await pathExists(join(root, 'layers'))).toBe(false);
      expect(await readFile(join(root, '.env.example'), 'utf8')).toBe('SITE_URL=\n');
      expect(await planTransition(root, removed, removed)).toEqual({ changes: [] });
    } finally {
      await oldKit.cleanup();
      await newKit.cleanup();
      await rm(fixture.root, { recursive: true, force: true });
    }
  });
});
