import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDiff } from '../../src/commands/diff';
import { FIXTURE_KIT_V2_ROOT, loadFixtureRegistryV2 } from '../support/fixtureKit';
import { must } from '../support/must';
import { generateProjectAtV1 } from '../support/upgradeFixture';

async function diff(projectRoot: string, paths?: string[]) {
  return runDiff({
    projectRoot,
    registry: await loadFixtureRegistryV2(),
    localKitRoot: FIXTURE_KIT_V2_ROOT,
    ...(paths === undefined ? {} : { paths }),
  });
}

describe('runDiff', () => {
  it('shows what upstream changed in a file', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const [entry] = await diff(projectRoot, ['app/pages/index.vue']);

    expect(must(entry).status).toBe('changed');
    expect(must(entry).patch).toContain('-  <h1>Home</h1>');
    expect(must(entry).patch).toContain('+  <h1>Welcome home</h1>');
  });

  it('marks identical files as unchanged', async () => {
    const projectRoot = await generateProjectAtV1(['pwa']);
    const [entry] = await diff(projectRoot, ['app/app.vue']);
    expect(must(entry).status).toBe('unchanged');
    expect(must(entry).patch).toBe('');
  });

  it('reports a file the user deleted as missing', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await rm(join(projectRoot, 'app/pages/index.vue'));
    const [entry] = await diff(projectRoot, ['app/pages/index.vue']);
    expect(must(entry).status).toBe('missing');
  });

  it('diffs every upstream file when no path is given', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const entries = await diff(projectRoot);
    expect(entries.length).toBeGreaterThan(1);
    expect(entries.some((entry) => entry.status === 'changed')).toBe(true);
  });
});
