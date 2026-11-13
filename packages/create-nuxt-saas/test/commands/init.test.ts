import { execFile } from 'node:child_process';
import type * as FileSystem from 'node:fs/promises';
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../src/commands/init';
import { CliError } from '../../src/errors';
import { DEFAULT_TEMPLATE, openKit, type KitSnapshot } from '../../src/kit/source';
import { readState } from '../../src/project/state';
import { pathExists, writeTextFile } from '../../src/util/fs';
import { createFixtureKit, makeTempDir } from '../support/fixtureKit';

// Keep real IO except when exercising otherwise-unreachable publication failures.
vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof FileSystem>();
  return { ...fs, rename: vi.fn(fs.rename), cp: vi.fn(fs.cp) };
});

const run = promisify(execFile);
const identity = { name: 'my-app', description: 'My project' };
let fixture: Awaited<ReturnType<typeof createFixtureKit>>;
let kit: KitSnapshot;
let parent: string;
let target: string;

beforeAll(async () => {
  fixture = await createFixtureKit();
  kit = await openKit(
    { kind: 'local', path: fixture.root, allowDirty: false },
    fixture.v1,
    DEFAULT_TEMPLATE,
  );
});
afterAll(async () => {
  await kit?.cleanup();
  if (fixture) await rm(fixture.root, { recursive: true, force: true });
});
beforeEach(async () => {
  parent = await makeTempDir('init');
  target = join(parent, 'my-app');
  vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  vi.stubEnv('GIT_AUTHOR_NAME', 'Fixture Author');
  vi.stubEnv('GIT_AUTHOR_EMAIL', 'fixture@example.invalid');
  vi.stubEnv('GIT_COMMITTER_NAME', 'Fixture Author');
  vi.stubEnv('GIT_COMMITTER_EMAIL', 'fixture@example.invalid');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  const fs = await vi.importActual<typeof FileSystem>('node:fs/promises');
  vi.mocked(rename).mockImplementation(fs.rename);
  vi.mocked(cp).mockImplementation(fs.cp);
  await rm(parent, { recursive: true, force: true });
});

function init(requested: string[] = [], git = false) {
  return runInit({ target, identity, requested, kit, git });
}
async function temporarySiblings(): Promise<string[]> {
  return (await readdir(parent)).filter((path) => path.startsWith('.nuxt-saas-'));
}

describe('runInit', () => {
  it('scaffolds the beta dependency closure at v1, including state, binary files and a git commit', async () => {
    const report = await init(['beta'], true);
    expect(report).toEqual({
      target,
      modules: ['alpha', 'beta'],
      git: 'committed',
      followUps: [
        'pnpm install',
        'pnpm db:generate',
        'cp .env.example .env and fill: SITE_URL, ALPHA_KEY',
      ],
    });
    expect(await readFile(join(target, 'layers/alpha/app/pages/alpha.vue'), 'utf8')).toContain(
      'Alpha v1',
    );
    expect(
      await readFile(join(target, 'layers/beta/server/db/schema.sqlite.ts'), 'utf8'),
    ).toContain('version: 1');
    expect(await pathExists(join(target, 'layers/docs'))).toBe(false);
    expect(await readFile(join(target, 'public/logo.png'))).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0x0d, 0x0a]),
    );
    expect(await readState(target)).toEqual({
      version: 3,
      kit: DEFAULT_TEMPLATE,
      commit: fixture.v1,
      modules: ['alpha', 'beta'],
      identity,
      conflicts: [],
    });
    const { stdout: status } = await run('git', ['-C', target, 'status', '--porcelain']);
    expect(status).toBe('');
    const { stdout: tracked } = await run('git', ['-C', target, 'ls-files', '.nuxt-saas.json']);
    expect(tracked.trim()).toBe('.nuxt-saas.json');
    expect(await temporarySiblings()).toEqual([]);
  });

  it('initializes base only in an existing empty directory without git', async () => {
    await mkdir(target);
    expect(await init()).toEqual({
      target,
      modules: [],
      git: 'skipped',
      followUps: ['pnpm install', 'cp .env.example .env and fill: SITE_URL'],
    });
    expect(await pathExists(join(target, '.git'))).toBe(false);
    expect(await pathExists(join(target, 'layers'))).toBe(false);
    expect((await readState(target)).modules).toEqual([]);
    expect(await temporarySiblings()).toEqual([]);
  });

  it('reports all-modules follow-ups on the fixture', async () => {
    const report = await init(['alpha', 'beta', 'docs']);
    expect(report.modules).toEqual(['alpha', 'beta', 'docs']);
    expect(report.followUps).toEqual([
      'pnpm install',
      'pnpm db:generate',
      'cp .env.example .env and fill: SITE_URL, ALPHA_KEY',
    ]);
    expect(await readFile(join(target, 'content/hello.md'), 'utf8')).toBe('# Hello\n');
  });

  it('skips a nested repository when the parent already is a git work tree', async () => {
    await run('git', ['-C', parent, 'init']);
    expect((await init([], true)).git).toBe('skipped');
    expect(await pathExists(join(target, '.git'))).toBe(false);
  });

  it('normalizes identity names with spaces and capitals without changing the directory name', async () => {
    target = join(parent, 'My Great App');
    const report = await runInit({
      target,
      identity: { name: 'My Great App', description: 'Named project' },
      requested: [],
      kit,
      git: false,
    });
    const pkg: unknown = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
    expect(pkg).toMatchObject({ name: 'my-great-app', description: 'Named project' });
    expect((await readState(target)).identity.name).toBe('my-great-app');
    expect(report.target).toBe(target);
  });

  it('refuses non-empty targets without changing their contents', async () => {
    await writeTextFile(join(target, '.keep'), 'mine\n');
    const creating = init();
    await expect(creating).rejects.toThrow(CliError);
    await expect(creating).rejects.toThrow('not empty');
    expect(await readdir(target)).toEqual(['.keep']);
    expect(await readFile(join(target, '.keep'), 'utf8')).toBe('mine\n');
    expect(await temporarySiblings()).toEqual([]);
  });

  it('does not replace an existing file target', async () => {
    await writeFile(target, 'mine');
    await expect(init()).rejects.toThrow('not empty');
    expect(await readFile(target, 'utf8')).toBe('mine');
    expect(await temporarySiblings()).toEqual([]);
  });

  it.each(['directory', 'dangling'])(
    'refuses a %s target symlink without following it',
    async (kind) => {
      const outside = join(parent, 'outside');
      if (kind === 'directory') await mkdir(outside);
      await symlink(outside, target);
      await expect(init()).rejects.toThrow(CliError);
      expect((await lstat(target)).isSymbolicLink()).toBe(true);
      if (kind === 'directory') expect(await readdir(outside)).toEqual([]);
      else expect(await pathExists(outside)).toBe(false);
      expect(await temporarySiblings()).toEqual([]);
    },
  );

  it('cleans up a render failure, leaving neither target nor a temporary sibling', async () => {
    const creating = runInit({
      target,
      identity,
      requested: ['beta'],
      kit: { ...kit, dir: join(parent, 'missing-kit') },
      git: false,
    });
    await expect(creating).rejects.toThrow(join(parent, 'missing-kit'));
    expect(await pathExists(target)).toBe(false);
    expect(await temporarySiblings()).toEqual([]);
  });

  it('leaves an empty target untouched when rendering fails', async () => {
    await mkdir(target);
    await expect(
      runInit({
        target,
        identity,
        requested: [],
        kit: { ...kit, dir: join(parent, 'missing-kit') },
        git: false,
      }),
    ).rejects.toThrow(join(parent, 'missing-kit'));
    expect(await readdir(target)).toEqual([]);
    expect(await temporarySiblings()).toEqual([]);
  });

  it('refuses unknown modules before publishing any files', async () => {
    await expect(init(['missing'])).rejects.toThrow('Unknown module');
    expect(await pathExists(target)).toBe(false);
    expect(await temporarySiblings()).toEqual([]);
  });

  it('cleans up when publication fails for a reason other than EXDEV', async () => {
    const fs = await vi.importActual<typeof FileSystem>('node:fs/promises');
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (to === target) throw Object.assign(new Error('rename denied'), { code: 'EACCES' });
      await fs.rename(from, to);
    });
    await expect(init()).rejects.toThrow('rename denied');
    expect(await pathExists(target)).toBe(false);
    expect(await temporarySiblings()).toEqual([]);
  });

  it('falls back to copying on EXDEV and removes the staging directory', async () => {
    const fs = await vi.importActual<typeof FileSystem>('node:fs/promises');
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (to === target) throw Object.assign(new Error('cross-device'), { code: 'EXDEV' });
      await fs.rename(from, to);
    });
    expect((await init()).git).toBe('skipped');
    expect((await readState(target)).commit).toBe(fixture.v1);
    expect(await temporarySiblings()).toEqual([]);
  });

  it('removes a partial copy when the EXDEV fallback fails', async () => {
    const fs = await vi.importActual<typeof FileSystem>('node:fs/promises');
    vi.mocked(rename).mockImplementation(async (from, to) => {
      if (to === target) throw Object.assign(new Error('cross-device'), { code: 'EXDEV' });
      await fs.rename(from, to);
    });
    vi.mocked(cp).mockImplementationOnce(async () => {
      await writeTextFile(join(target, 'partial.txt'), 'partial');
      throw new Error('copy failed');
    });
    await expect(init()).rejects.toThrow('copy failed');
    expect(await pathExists(target)).toBe(false);
    expect(await temporarySiblings()).toEqual([]);
  });
});
