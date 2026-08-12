import { describe, expect, it } from 'vitest';
import { listFiles } from '../../src/util/fs';
import { FIXTURE_KIT_V1_ROOT, loadFixtureRegistry, makeTempDir } from './fixtureKit';

describe('fixture kit', () => {
  it('contains the expected source tree', async () => {
    expect(await listFiles(FIXTURE_KIT_V1_ROOT)).toEqual([
      'app/app.vue',
      'app/components/InstallPrompter.vue',
      'app/pages/index.vue',
      'content.config.ts',
      'nuxt.config.ts',
      'package.json',
      'registry.json',
    ]);
  });

  it('parses its registry', async () => {
    const registry = await loadFixtureRegistry();
    expect(registry.modules.map((module) => module.id)).toEqual(['base', 'content', 'pwa']);
  });

  it('creates isolated temp directories', async () => {
    expect(await makeTempDir('render')).not.toBe(await makeTempDir('render'));
  });
});
