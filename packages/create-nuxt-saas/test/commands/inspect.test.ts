import { mkdir, readFile, rm, stat, symlink, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { main } from '../../src/cli';
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

async function invokeComparison(baseline: string, args: string[]) {
  const output = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  try {
    const code = await main([
      'inspect',
      '--json',
      '--dir',
      projectRoot,
      '--baseline-dir',
      baseline,
      ...args,
    ]);
    const text = output.mock.calls.map(([line]) => String(line)).join('');
    const report: unknown = text ? JSON.parse(text) : null;
    return { code, report };
  } finally {
    output.mockRestore();
  }
}

async function comparison(...args: string[]): Promise<unknown> {
  const { code, report } = await invokeComparison(join(parent, 'baseline'), args);
  expect(code, JSON.stringify(report)).toBe(0);
  return report;
}

async function prepareComparison(): Promise<void> {
  await mkdir(join(parent, 'baseline'), { mode: 0o700 });
  expect(await comparison('--kit', fixture.root)).toEqual({
    schema: 1,
    commit: fixture.v1,
    projectComparison: true,
  });
}

function patch(path: string, ...args: string[]) {
  return comparison(`--file=${path}`, ...args);
}

describe('project comparison', () => {
  it('uses the installed render and reads the selected uncommitted file on each request', async () => {
    await init();
    await prepareComparison();
    await writeTextFile(join(projectRoot, homePath), '<template>uncommitted</template>\n');
    expect(await patch(homePath)).toMatchObject({
      schema: 1,
      path: homePath,
      status: 'text',
      patch: expect.stringContaining('+<template>uncommitted</template>'),
    });
    await writeTextFile(join(projectRoot, homePath), '<template>newest</template>\n');
    const updated = await patch(homePath);
    expect(updated).toMatchObject({
      status: 'text',
      patch: expect.stringContaining('-  <h1>Home v1</h1>'),
    });
    expect(updated).toMatchObject({
      patch: expect.stringContaining('+<template>newest</template>'),
    });
    expect(updated).not.toMatchObject({ patch: expect.stringContaining('Home v2') });
  });

  it('shows the rendered identity and modules for a deleted generated README', async () => {
    await init();
    await prepareComparison();
    await unlink(join(projectRoot, 'README.md'));
    const result = await patch('README.md');
    expect(result).toMatchObject({
      path: 'README.md',
      status: 'text',
      patch: expect.stringContaining('+++ /dev/null'),
    });
    expect(result).toMatchObject({ patch: expect.stringContaining('-# my-project') });
    expect(result).toMatchObject({ patch: expect.stringContaining('-A user-owned project') });
    expect(result).toMatchObject({ patch: expect.stringContaining('**Beta**') });
    expect(result).not.toMatchObject({ patch: expect.stringContaining('{{modules}}') });
  });

  it('does not create baseline files inside the project', async () => {
    await init();
    const result = await invokeComparison(projectRoot, ['--kit', fixture.root]);
    expect(result).toMatchObject({ code: 1, report: { error: { kind: 'expected' } } });
    await expect(stat(join(projectRoot, 'entries'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('compares substituted package metadata, not the raw kit package', async () => {
    await init();
    await prepareComparison();
    const path = join(projectRoot, 'package.json');
    const installed = await readFile(path, 'utf8');
    await writeTextFile(
      path,
      installed.replace('"name": "my-project"', '"name": "renamed-project"'),
    );
    const result = await patch('package.json');
    expect(result).toMatchObject({
      path: 'package.json',
      status: 'text',
      patch: expect.stringContaining('-  "name": "my-project",'),
    });
    expect(result).toMatchObject({
      patch: expect.stringContaining('+  "name": "renamed-project",'),
    });
  });

  it('does not substitute an adjacent file or diff a path outside the baseline', async () => {
    await init(['beta', 'docs']);
    await prepareComparison();
    await writeTextFile(join(projectRoot, 'untracked.txt'), 'not a baseline file\n');
    expect(await patch('untracked.txt')).toEqual({
      schema: 1,
      path: 'untracked.txt',
      status: 'missing',
    });
    expect(await patch(homePath)).toEqual({ schema: 1, path: homePath, status: 'unchanged' });
    expect(await patch('content/hello.md')).toMatchObject({ status: 'unavailable' });
    expect(await patch('../outside.txt')).toMatchObject({ status: 'unavailable' });
    expect(await patch('/etc/hosts')).toMatchObject({ status: 'unavailable' });
    expect(await patch('app/pages/../pages/index.vue')).toMatchObject({ status: 'unavailable' });
  });

  it('refuses both leaf and ancestor symlinks, including dangling links', async () => {
    await init();
    await prepareComparison();
    await unlink(join(projectRoot, homePath));
    await symlink(join(parent, 'missing'), join(projectRoot, homePath));
    expect(await patch(homePath)).toMatchObject({ status: 'unavailable' });
    await rm(join(projectRoot, 'app/pages'), { recursive: true });
    await symlink(parent, join(projectRoot, 'app/pages'));
    await writeTextFile(join(parent, 'index.vue'), 'outside the project');
    expect(await patch(homePath)).toMatchObject({ status: 'unavailable' });
  });

  it('summarizes binary files and refuses oversized input and patch output', async () => {
    await init();
    await prepareComparison();
    expect(await patch('public/logo.png')).toEqual({
      schema: 1,
      path: 'public/logo.png',
      status: 'binary',
    });
    await writeTextFile(join(projectRoot, homePath), 'x'.repeat(1_500_001));
    expect(await patch(homePath)).toEqual({ schema: 1, path: homePath, status: 'tooLarge' });
    await writeTextFile(
      join(projectRoot, homePath),
      'small enough to read but the patch cannot fit\n',
    );
    expect(await patch(homePath, '--max-bytes', '32')).toEqual({
      schema: 1,
      path: homePath,
      status: 'tooLarge',
    });
    expect(await patch(homePath, '--max-bytes', '0')).toEqual({
      schema: 1,
      path: homePath,
      status: 'tooLarge',
    });
  });
});

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
