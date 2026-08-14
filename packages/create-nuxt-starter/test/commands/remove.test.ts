import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runRemove } from '../../src/commands/remove';
import { readManifest } from '../../src/manifest/io';
import { pathExists, readTextFile } from '../../src/util/fs';
import { loadFixtureRegistry } from '../support/fixtureKit';
import {
  commitAll,
  editFile,
  generateProjectAtV1,
  resolveFixtureKit,
} from '../support/upgradeFixture';

async function remove(projectRoot: string, moduleIds: string[], check = false) {
  return runRemove({
    projectRoot,
    registry: await loadFixtureRegistry(),
    moduleIds,
    check,
    force: false,
    resolveLocalKit: resolveFixtureKit,
  });
}

describe('runRemove', () => {
  it("deletes the module's files and manifest entry", async () => {
    const projectRoot = await generateProjectAtV1(['pwa']);
    const report = await remove(projectRoot, ['pwa']);

    expect(report.moduleIds).toEqual(['pwa']);
    expect(await pathExists(join(projectRoot, 'app/components/InstallPrompter.vue'))).toBe(false);
    const manifest = await readManifest(projectRoot);
    expect(manifest.modules.map((module) => module.id)).not.toContain('pwa');
  });

  it("strips the module's marker block from shared files", async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await remove(projectRoot, ['content']);

    const config = await readTextFile(join(projectRoot, 'nuxt.config.ts'));
    expect(config).not.toContain('@nuxt/content');
    expect(config).not.toContain('<nsk:content>');
    expect(await pathExists(join(projectRoot, 'content.config.ts'))).toBe(false);
  });

  it("removes the module's package.json entries", async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await remove(projectRoot, ['content']);

    const packageJson = await readTextFile(join(projectRoot, 'package.json'));
    expect(packageJson).not.toContain('@nuxt/content');
  });

  it('leaves other modules intact', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await remove(projectRoot, ['content']);

    const manifest = await readManifest(projectRoot);
    expect(manifest.modules.map((module) => module.id)).toEqual(['base']);
    expect(await pathExists(join(projectRoot, 'app/app.vue'))).toBe(true);
  });

  it('keeps a file the user edited, as an orphan', async () => {
    const projectRoot = await generateProjectAtV1(['pwa']);
    await editFile(
      projectRoot,
      'app/components/InstallPrompter.vue',
      '<template>mine</template>\n',
    );
    await commitAll(projectRoot);

    const report = await remove(projectRoot, ['pwa']);
    expect(await pathExists(join(projectRoot, 'app/components/InstallPrompter.vue'))).toBe(true);
    expect(report.applied?.orphaned).toContain('app/components/InstallPrompter.vue');
  });

  it('refuses to remove a module other modules require', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await expect(remove(projectRoot, ['base'])).rejects.toThrow(/content/);
  });

  // The registry's module definitions describe the revision they shipped with, so
  // rendering the project's current state from a moved-on registry diffs against a
  // state it was never in.
  it('refuses a registry on a different kit revision', async () => {
    const projectRoot = await generateProjectAtV1(['pwa']);
    const registry = await loadFixtureRegistry();
    const moved = { ...registry, kit: { ...registry.kit, revision: 'somewhere-else' } };

    await expect(
      runRemove({
        projectRoot,
        registry: moved,
        moduleIds: ['pwa'],
        check: false,
        force: false,
        resolveLocalKit: resolveFixtureKit,
      }),
    ).rejects.toThrow(/Run "nuxt-starter upgrade" first/);
  });

  it('refuses a module that is not installed', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await expect(remove(projectRoot, ['pwa'])).rejects.toThrow(/not installed/);
  });

  // Nothing survives to report the broken requirement, so the dependency check
  // above passes and every generated file goes.
  it('refuses to empty the project', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await expect(remove(projectRoot, ['base'])).rejects.toThrow(/no modules/);
    expect(await pathExists(join(projectRoot, 'app/app.vue'))).toBe(true);
  });

  it('refuses to empty the project one module at a time', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await expect(remove(projectRoot, ['base', 'content'])).rejects.toThrow(/no modules/);
    expect(await pathExists(join(projectRoot, 'app/app.vue'))).toBe(true);
  });

  it('previews without writing', async () => {
    const projectRoot = await generateProjectAtV1(['pwa']);
    const report = await remove(projectRoot, ['pwa'], true);
    expect(report.applied).toBeNull();
    expect(await pathExists(join(projectRoot, 'app/components/InstallPrompter.vue'))).toBe(true);
  });
});
