import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runStatus } from '../../src/commands/status';
import { loadFixtureRegistry, loadFixtureRegistryV2 } from '../support/fixtureKit';
import { must } from '../support/must';
import { editFile, generateProjectAtV1 } from '../support/upgradeFixture';

describe('runStatus', () => {
  it('lists installed modules and finds nothing modified in a fresh project', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    const report = await runStatus({ projectRoot, registry: null });

    expect(report.revision).toBe('v1');
    expect(report.modules.map((module) => module.id)).toEqual(['base', 'content']);
    expect(report.modules.every((module) => module.modified.length === 0)).toBe(true);
  });

  it('reports files the user modified or deleted', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/app.vue', '<template><div>mine</div></template>\n');
    await rm(join(projectRoot, 'app/legacy.ts'));

    const report = await runStatus({ projectRoot, registry: null });
    const base = must(report.modules.find((module) => module.id === 'base'));
    expect(base.modified).toContain('app/app.vue');
    expect(base.missing).toContain('app/legacy.ts');
  });

  it('reports damaged markers', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await editFile(projectRoot, 'nuxt.config.ts', 'export default {\n  // <nsk:content>\n};\n');

    const report = await runStatus({ projectRoot, registry: null });
    expect(report.damagedMarkers).toContain('nuxt.config.ts');
  });

  it('detects an available update from the registry alone', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const withNewer = await runStatus({ projectRoot, registry: await loadFixtureRegistryV2() });
    const withSame = await runStatus({ projectRoot, registry: await loadFixtureRegistry() });
    expect(withNewer.updateAvailable).toBe(true);
    expect(withSame.updateAvailable).toBe(false);
  });
});
