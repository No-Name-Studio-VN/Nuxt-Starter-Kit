import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadTemplate } from 'giget';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError } from '../../src/errors';
import { DEFAULT_TEMPLATE, openKit, parseTemplate, resolveCommit } from '../../src/kit/source';
import { pathExists } from '../../src/util/fs';
import { createFixtureKit } from '../support/fixtureKit';

vi.mock('giget', () => ({ downloadTemplate: vi.fn() }));

let kit: Awaited<ReturnType<typeof createFixtureKit>>;
const snapshots: string[] = [];

beforeEach(async () => {
  kit = await createFixtureKit();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  await rm(kit.root, { recursive: true, force: true });
  await Promise.all(snapshots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('parseTemplate', () => {
  it('defaults the official template and unqualified refs to main', () => {
    expect(parseTemplate(DEFAULT_TEMPLATE)).toEqual({
      repo: 'No-Name-Studio-VN/Nuxt-Starter-Kit',
      ref: 'main',
    });
    expect(parseTemplate('github:o/r')).toEqual({ repo: 'o/r', ref: 'main' });
  });

  it('preserves tags and branch refs', () => {
    expect(parseTemplate('github:o/r#v3')).toEqual({ repo: 'o/r', ref: 'v3' });
    expect(parseTemplate('github:o/r#feature/layers')).toEqual({
      repo: 'o/r',
      ref: 'feature/layers',
    });
  });

  it.each([
    'invalid',
    'https://github.com/o/r',
    'github:o',
    'github:o/r/extra',
    'github:o/r#',
    'github:o/r#a#b',
  ])('rejects invalid template %s', (template) => {
    expect(() => parseTemplate(template)).toThrow(CliError);
  });
});

describe('local kit sources', () => {
  it('resolves HEAD to the full v2 commit', async () => {
    expect(await resolveCommit({ kind: 'local', path: kit.root, allowDirty: false })).toBe(kit.v2);
    expect(kit.v2).toMatch(/^[a-f0-9]{40}$/);
  });

  it('refuses untracked changes unless explicitly allowed', async () => {
    await writeFile(join(kit.root, 'untracked.txt'), 'local only');
    await expect(
      resolveCommit({ kind: 'local', path: kit.root, allowDirty: false }),
    ).rejects.toThrow(/uncommitted changes/);
    expect(await resolveCommit({ kind: 'local', path: kit.root, allowDirty: true })).toBe(kit.v2);
  });

  it('refuses tracked edits as well', async () => {
    await writeFile(join(kit.root, 'README.md'), 'edited');
    await expect(
      resolveCommit({ kind: 'local', path: kit.root, allowDirty: false }),
    ).rejects.toThrow(CliError);
  });

  it('archives the requested commit, ignoring dirty and untracked contents', async () => {
    await writeFile(join(kit.root, 'untracked.txt'), 'local only');
    await writeFile(join(kit.root, 'app/pages/index.vue'), 'local edit');
    const snapshot = await openKit(
      { kind: 'local', path: kit.root, allowDirty: true },
      kit.v1,
      DEFAULT_TEMPLATE,
    );
    snapshots.push(snapshot.dir);
    expect(snapshot.commit).toBe(kit.v1);
    expect(snapshot.template).toBe(DEFAULT_TEMPLATE);
    expect(snapshot.modules.map((module) => module.id)).toEqual(['alpha', 'beta', 'docs']);
    expect(await readFile(join(snapshot.dir, 'app/pages/index.vue'), 'utf8')).toContain('Home v1');
    expect(await pathExists(join(snapshot.dir, 'app/pages/new.vue'))).toBe(false);
    expect(await pathExists(join(snapshot.dir, 'untracked.txt'))).toBe(false);
    expect(await pathExists(join(snapshot.dir, '.git'))).toBe(false);
    expect((await readFile(join(snapshot.dir, 'public/logo.png'))).includes(0)).toBe(true);
    await snapshot.cleanup();
    await snapshot.cleanup();
    expect(await pathExists(snapshot.dir)).toBe(false);
  });

  it('explains an unavailable commit and suggests a local kit', async () => {
    await expect(
      openKit(
        { kind: 'local', path: kit.root, allowDirty: false },
        '0'.repeat(40),
        DEFAULT_TEMPLATE,
      ),
    ).rejects.toThrow(/was never pushed.*--kit/s);
  });

  it('wraps invalid local repositories in a CLI error', async () => {
    await expect(
      resolveCommit({ kind: 'local', path: join(kit.root, 'missing'), allowDirty: false }),
    ).rejects.toThrow(CliError);
  });
});

describe('GitHub kit sources', () => {
  const source = { kind: 'github', repo: 'o/r', ref: 'feature/layers' } satisfies Parameters<
    typeof resolveCommit
  >[0];

  it('resolves with a token, an encoded ref, and a 15 second timeout', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'test-token');
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ sha: 'a'.repeat(40) }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    try {
      expect(await resolveCommit(source)).toBe('a'.repeat(40));
      expect(fetcher).toHaveBeenCalledWith(
        'https://api.github.com/repos/o/r/commits/feature%2Flayers',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
          signal: expect.any(AbortSignal),
        }),
      );
      expect(timeout).toHaveBeenCalledWith(15_000);
    } finally {
      timeout.mockRestore();
    }
  });

  it('works without an authentication token', async () => {
    vi.stubEnv('GITHUB_TOKEN', '');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sha: kit.v2 })));
    vi.stubGlobal('fetch', fetcher);
    expect(await resolveCommit(source)).toBe(kit.v2);
    expect(fetcher).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: {} }),
    );
  });

  it.each([403, 404, 500])('identifies repo, ref and HTTP %s failures', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
    await expect(resolveCommit(source)).rejects.toThrow(CliError);
    await expect(resolveCommit(source)).rejects.toThrow(
      new RegExp(`o/r.*feature/layers.*${status}`),
    );
  });

  it('wraps network failures with the source and cause', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(resolveCommit(source)).rejects.toThrow(/o\/r.*feature\/layers.*offline/);
  });

  it.each([{ sha: 'short' }, {}, { sha: 42 }])(
    'rejects malformed commit responses %j',
    async (body) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation(async () => new Response(JSON.stringify(body))),
      );
      await expect(resolveCommit(source)).rejects.toThrow(CliError);
    },
  );

  it('downloads the resolved sha, not the mutable ref, and reads its modules', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'test-token');
    vi.mocked(downloadTemplate).mockImplementation(async (input, options) => {
      expect(input).toBe(`github:o/r#${kit.v1}`);
      expect(options?.auth).toBe('test-token');
      if (!options?.dir) throw new Error('Missing snapshot directory');
      snapshots.push(options.dir);
      await cp(join(kit.root, 'layers'), join(options.dir, 'layers'), { recursive: true });
      return { source: input, dir: options.dir };
    });
    const snapshot = await openKit(source, kit.v1, DEFAULT_TEMPLATE);
    expect(snapshot.modules.map((module) => module.id)).toEqual(['alpha', 'beta', 'docs']);
    await snapshot.cleanup();
    expect(await pathExists(snapshot.dir)).toBe(false);
  });

  it('cleans partial downloads and explains unavailable commits', async () => {
    let partialDir = '';
    vi.mocked(downloadTemplate).mockImplementation(async (_input, options) => {
      if (!options?.dir) throw new Error('Missing snapshot directory');
      partialDir = options.dir;
      await writeFile(join(partialDir, 'partial.txt'), 'partial');
      throw new Error('HTTP 404');
    });
    await expect(openKit(source, kit.v1, DEFAULT_TEMPLATE)).rejects.toThrow(
      /was never pushed.*--kit/s,
    );
    expect(partialDir).not.toBe('');
    expect(await pathExists(partialDir)).toBe(false);
  });
});
