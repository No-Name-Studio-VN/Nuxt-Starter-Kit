import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runUpgrade } from '../../src/commands/upgrade';
import { readManifest } from '../../src/manifest/io';
import { loadFixtureRegistry, loadFixtureRegistryV2 } from '../support/fixtureKit';
import { editFile, generateProjectAtV1, resolveFixtureKit } from '../support/upgradeFixture';

async function upgrade(projectRoot: string, overrides: { check?: boolean; force?: boolean } = {}) {
  return runUpgrade({
    projectRoot,
    registry: await loadFixtureRegistryV2(),
    check: overrides.check ?? false,
    force: overrides.force ?? false,
    resolveLocalKit: resolveFixtureKit,
  });
}

describe('runUpgrade', () => {
  it('previews without writing when checking', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const report = await upgrade(projectRoot, { check: true });

    expect(report.fromRevision).toBe('v1');
    expect(report.toRevision).toBe('v2');
    expect(report.summary.overwrite).toBeGreaterThan(0);
    expect(report.applied).toBeNull();
    expect(await readFile(join(projectRoot, 'app/pages/index.vue'), 'utf8')).not.toContain(
      'Welcome home',
    );
    expect((await readManifest(projectRoot)).kit.revision).toBe('v1');
  });

  it('applies the upgrade', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const report = await upgrade(projectRoot);

    expect(report.applied).not.toBeNull();
    expect(await readFile(join(projectRoot, 'app/pages/index.vue'), 'utf8')).toContain(
      'Welcome home',
    );
  });

  it('refuses to run on a dirty working tree', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/app.vue', 'dirty\n');
    await expect(upgrade(projectRoot)).rejects.toThrow(/uncommitted changes/);
  });

  it('allows a dirty tree with force', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/app.vue', 'dirty\n');
    await expect(upgrade(projectRoot, { force: true })).resolves.toBeDefined();
  });

  it('previews a dirty tree without complaining', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/app.vue', 'dirty\n');
    await expect(upgrade(projectRoot, { check: true })).resolves.toBeDefined();
  });

  it('reports an up-to-date project without fetching anything', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const report = await runUpgrade({
      projectRoot,
      registry: await loadFixtureRegistry(),
      check: false,
      force: false,
      resolveLocalKit: resolveFixtureKit,
    });
    expect(report.upToDate).toBe(true);
    expect(report.applied).toBeNull();
  });

  it('surfaces conflicts in the report', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(
      projectRoot,
      'app/pages/index.vue',
      '<template>\n  <h1>Mine</h1>\n</template>\n',
    );
    const report = await upgrade(projectRoot, { force: true });
    expect(report.conflicted).toEqual(['app/pages/index.vue']);
  });
});
