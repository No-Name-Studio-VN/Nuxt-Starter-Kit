import { describe, expect, it } from 'vitest';
import { readManifest } from '../../src/manifest/io';
import { planTransition } from '../../src/upgrade/plan';
import { loadFixtureRegistry } from '../support/fixtureKit';
import { generateProjectAtV1, resolveFixtureKit } from '../support/upgradeFixture';

async function transition(projectRoot: string, from: string[], to: string[]) {
  const manifest = await readManifest(projectRoot);
  return planTransition({
    projectRoot,
    registry: await loadFixtureRegistry(),
    from: { revision: manifest.kit.revision, moduleIds: from },
    to: { revision: manifest.kit.revision, moduleIds: to },
    resolveLocalKit: resolveFixtureKit,
  });
}

describe('planTransition', () => {
  it("adds a module's files without changing revision", async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const plan = await transition(projectRoot, ['base'], ['base', 'pwa']);

    const added = plan.actions
      .filter((action) => action.type === 'add')
      .map((action) => action.path);
    expect(added).toContain('app/components/InstallPrompter.vue');
    expect(plan.actions.filter((action) => action.type === 'delete')).toEqual([]);
    expect(plan.fromRevision).toBe(plan.toRevision);
    await plan.cleanup();
  });

  it("removes a module's files without changing revision", async () => {
    const projectRoot = await generateProjectAtV1(['pwa']);
    const plan = await transition(projectRoot, ['base', 'pwa'], ['base']);

    const deleted = plan.actions
      .filter((action) => action.type === 'delete')
      .map((action) => action.path);
    expect(deleted).toContain('app/components/InstallPrompter.vue');
    await plan.cleanup();
  });

  it('writes a marker block into a shared file when adding', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const plan = await transition(projectRoot, ['base'], ['base', 'content']);

    const config = plan.actions.find((action) => action.path === 'nuxt.config.ts');
    expect(config?.type).toBe('overwrite');
    if (config?.type !== 'overwrite') return;
    expect(config.content).toContain('@nuxt/content');
    expect(config.content).toContain('<nsk:content>');
    await plan.cleanup();
  });

  it('strips a marker block from a shared file when removing', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    const plan = await transition(projectRoot, ['base', 'content'], ['base']);

    const config = plan.actions.find((action) => action.path === 'nuxt.config.ts');
    expect(config?.type).toBe('overwrite');
    if (config?.type !== 'overwrite') return;
    expect(config.content).not.toContain('@nuxt/content');
    await plan.cleanup();
  });

  it('reports the resolved target module set', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const plan = await transition(projectRoot, ['base'], ['base', 'content']);
    expect(plan.targetModuleIds).toEqual(['base', 'content']);
    await plan.cleanup();
  });
});
