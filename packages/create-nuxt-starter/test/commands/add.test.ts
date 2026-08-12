import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAdd } from '../../src/commands/add';
import { readManifest } from '../../src/manifest/io';
import { pathExists, readTextFile } from '../../src/util/fs';
import { loadFixtureRegistry, loadFixtureRegistryV2 } from '../support/fixtureKit';
import { must } from '../support/must';
import { generateProjectAtV1, resolveFixtureKit } from '../support/upgradeFixture';

async function add(projectRoot: string, moduleIds: string[], check = false) {
  return runAdd({
    projectRoot,
    registry: await loadFixtureRegistry(),
    moduleIds,
    check,
    force: false,
    resolveLocalKit: resolveFixtureKit,
  });
}

describe('runAdd', () => {
  it('installs a module and its files', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const report = await add(projectRoot, ['pwa']);

    expect(report.moduleIds).toEqual(['pwa']);
    expect(await pathExists(join(projectRoot, 'app/components/InstallPrompter.vue'))).toBe(true);
    const manifest = await readManifest(projectRoot);
    expect(manifest.modules.map((module) => module.id)).toContain('pwa');
  });

  it('inserts the module marker block into shared files', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await add(projectRoot, ['content']);

    const config = await readTextFile(join(projectRoot, 'nuxt.config.ts'));
    expect(config).toContain('@nuxt/content');
    expect(config).toContain('<nsk:content>');
    expect(await pathExists(join(projectRoot, 'content.config.ts'))).toBe(true);
  });

  it("records the module's structured entries", async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await add(projectRoot, ['content']);

    const manifest = await readManifest(projectRoot);
    expect(
      must(manifest.modules.find((module) => module.id === 'content')).structured,
    ).toHaveProperty('package.json');
  });

  it('reports module notes', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const report = await add(projectRoot, ['pwa']);
    expect(report.notes).toContain('Generate PWA icons before deploying.');
  });

  it('is a no-op when the module is already installed', async () => {
    const projectRoot = await generateProjectAtV1(['pwa']);
    const report = await add(projectRoot, ['pwa']);
    expect(report.moduleIds).toEqual([]);
    expect(report.applied).toBeNull();
  });

  it('previews without writing', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const report = await add(projectRoot, ['pwa'], true);
    expect(report.applied).toBeNull();
    expect(await pathExists(join(projectRoot, 'app/components/InstallPrompter.vue'))).toBe(false);
  });

  it('refuses an unknown module', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await expect(add(projectRoot, ['nope'])).rejects.toThrow(/Unknown module/);
  });

  it('refuses when the registry has moved to a newer revision', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await expect(
      runAdd({
        projectRoot,
        registry: await loadFixtureRegistryV2(),
        moduleIds: ['pwa'],
        check: false,
        force: false,
        resolveLocalKit: resolveFixtureKit,
      }),
    ).rejects.toThrow(/upgrade/i);
  });
});
