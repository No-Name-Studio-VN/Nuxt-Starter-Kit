import { readFile, rm, stat, symlink, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runInit } from '../../src/commands/init';
import { runInspect, type InspectReport } from '../../src/commands/inspect';
import { DEFAULT_USER_OWNED, readKitConfig } from '../../src/kit/config';
import { DEFAULT_TEMPLATE, openKit, type KitSnapshot } from '../../src/kit/source';
import { readState, STATE_FILE, writeState } from '../../src/project/state';
import { listFiles, writeTextFile } from '../../src/util/fs';
import { createFixtureKit, makeTempDir } from '../support/fixtureKit';

const identity = { name: 'my-project', description: 'A user-owned project' };
const homePath = 'app/pages/index.vue';
const layerPath = 'layers/beta/server/db/schema.sqlite.ts';
let fixture: Awaited<ReturnType<typeof createFixtureKit>>;
let v1: KitSnapshot;
let parent: string;
let projectRoot: string;

beforeAll(async () => {
  fixture = await createFixtureKit();
  const source = { kind: 'local', path: fixture.root, allowDirty: false } satisfies Parameters<
    typeof openKit
  >[0];
  v1 = await openKit(source, fixture.v1, DEFAULT_TEMPLATE);
});
afterAll(async () => {
  await v1?.cleanup();
  if (fixture) await rm(fixture.root, { recursive: true, force: true });
});
beforeEach(async () => {
  parent = await makeTempDir('inspect');
  projectRoot = join(parent, 'project');
  vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  vi.stubEnv('GIT_AUTHOR_NAME', 'Fixture Author');
  vi.stubEnv('GIT_AUTHOR_EMAIL', 'fixture@example.invalid');
  vi.stubEnv('GIT_COMMITTER_NAME', 'Fixture Author');
  vi.stubEnv('GIT_COMMITTER_EMAIL', 'fixture@example.invalid');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(parent, { recursive: true, force: true });
});

function init(requested = ['beta']) {
  return runInit({ target: projectRoot, identity, requested, kit: v1, git: true });
}

function inspect() {
  return runInspect({ projectRoot, kit: v1 });
}

function statusOf(report: InspectReport, path: string) {
  return report.files.find((file) => file.path === path);
}

describe('readKitConfig', () => {
  it('defaults userOwned when kit.json has none', async () => {
    const config = await readKitConfig(v1.dir);
    expect(config.userOwned).toEqual(DEFAULT_USER_OWNED);
    expect(config.exclude).toContain('packages/**');
  });
});

describe('runInspect', () => {
  it('reports every rendered file unchanged on a fresh project', async () => {
    await init();
    const report = await inspect();
    expect(report.commit).toBe(v1.commit);
    expect(report.kit).toBe(v1.template);
    expect(report.modules).toContain('beta');
    expect(report.identity).toEqual(identity);
    expect(report.summary.edited).toBe(0);
    expect(report.summary.deleted).toBe(0);
    expect(report.summary.total).toBe(report.files.length);
    expect(report.summary.scoredChanged).toBe(0);
    expect(report.conflicts).toEqual({ recorded: [], unresolved: [] });
  });

  it('classifies edited, deleted and protected files', async () => {
    await init(['beta', 'docs']);
    await writeTextFile(join(projectRoot, homePath), '<template>mine</template>\n');
    await rm(join(projectRoot, layerPath));
    await writeTextFile(join(projectRoot, '.env.example'), 'MINE=\n');
    const report = await inspect();
    expect(statusOf(report, homePath)).toMatchObject({ status: 'edited', layer: 'base' });
    expect(statusOf(report, layerPath)).toMatchObject({ status: 'deleted', layer: 'beta' });
    expect(statusOf(report, '.env.example')).toMatchObject({ status: 'edited', expected: true });
    expect(statusOf(report, 'content/hello.md')?.status).toBe('protected');
    expect(statusOf(report, '.nuxt-saas.json')).toBeUndefined();
  });

  it('scores only non-protected, non-expected files', async () => {
    await init(['beta', 'docs']);
    await writeTextFile(join(projectRoot, homePath), '<template>mine</template>\n');
    await rm(join(projectRoot, layerPath));
    await writeTextFile(join(projectRoot, '.env.example'), 'MINE=\n');
    await writeTextFile(join(projectRoot, 'content/hello.md'), 'mine\n');
    const { summary, files } = await inspect();
    const scored = files.filter((file) => file.status !== 'protected' && !file.expected);
    expect(summary.protected).toBe(files.filter((file) => file.status === 'protected').length);
    expect(summary.protected).toBeGreaterThan(0);
    expect(summary.expected).toBeGreaterThan(0);
    expect(summary.scored).toBe(summary.total - summary.protected - summary.expected);
    expect(summary.scored).toBe(scored.length);
    expect(summary.scoredChanged).toBe(
      scored.filter((file) => file.status === 'edited' || file.status === 'deleted').length,
    );
    expect(summary.scoredChanged).toBe(2);
    expect(summary.edited).toBe(2);
    expect(summary.deleted).toBe(1);
    expect(summary.unchanged + summary.edited + summary.deleted + summary.protected).toBe(
      summary.total,
    );
  });

  it('maps rootFiles to their module', async () => {
    await init(['docs']);
    const report = await inspect();
    expect(statusOf(report, 'content/hello.md')).toMatchObject({ layer: 'docs' });
    expect(statusOf(report, homePath)).toMatchObject({ layer: 'base' });
  });

  it('marks userOwned globs and the rendered README as expected', async () => {
    await init();
    const report = await inspect();
    expect(statusOf(report, 'public/logo.png')?.expected).toBe(true);
    expect(statusOf(report, 'README.md')?.expected).toBe(true);
    expect(statusOf(report, homePath)?.expected).toBe(false);
  });

  it('reports unresolved conflicts', async () => {
    await init();
    const state = await readState(projectRoot);
    await writeState(projectRoot, { ...state, conflicts: [homePath] });
    await writeTextFile(
      join(projectRoot, homePath),
      '<<<<<<< yours\nmine\n=======\ntheirs\n>>>>>>> kit\n',
    );
    const report = await inspect();
    expect(report.conflicts).toEqual({ recorded: [homePath], unresolved: [homePath] });
  });

  it('treats symlinks as edited, not followed', async () => {
    await init();
    await unlink(join(projectRoot, homePath));
    await symlink(join(projectRoot, 'package.json'), join(projectRoot, homePath));
    const report = await inspect();
    expect(statusOf(report, homePath)?.status).toBe('edited');
  });

  it('never writes', async () => {
    await init();
    await writeTextFile(join(projectRoot, homePath), '<template>mine</template>\n');
    async function snapshot() {
      const paths = (await listFiles(projectRoot)).filter((path) => !path.startsWith('.git/'));
      const entries = new Map<string, { mtime: number; content: string }>();
      for (const path of paths) {
        const absolute = join(projectRoot, path);
        entries.set(path, {
          mtime: (await stat(absolute)).mtimeMs,
          content: (await readFile(absolute)).toString('base64'),
        });
      }
      return entries;
    }
    const before = await snapshot();
    expect(before.has(STATE_FILE)).toBe(true);
    await inspect();
    expect(await snapshot()).toEqual(before);
  });
});
