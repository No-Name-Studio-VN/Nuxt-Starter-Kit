import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRegistryFromKit } from '../../src/registry/fromKit';
import { writeJsonAtomically } from '../../src/util/fs';
import { FIXTURE_KIT_V1_ROOT, FIXTURE_KIT_V2_ROOT, makeTempDir } from '../support/fixtureKit';
import { must } from '../support/must';

describe('loadRegistryFromKit', () => {
  it('reads a registry at the kit root', async () => {
    const registry = await loadRegistryFromKit(FIXTURE_KIT_V1_ROOT);
    expect(registry?.kit.revision).toBe('v1');
  });

  it('sees the newer revision in the newer kit', async () => {
    const registry = await loadRegistryFromKit(FIXTURE_KIT_V2_ROOT);
    expect(registry?.kit.revision).toBe('v2');
    expect(must(registry?.modules.find((module) => module.id === 'base')).paths).not.toContain(
      'app/legacy.ts',
    );
  });

  it('finds the registry inside the packaged CLI directory', async () => {
    const kitRoot = await makeTempDir('kit');
    await writeJsonAtomically(
      join(kitRoot, 'packages/create-nuxt-saas/registry/registry.json'),
      {
        schemaVersion: 2,
        version: '1.0.0',
        kit: { template: 'github:acme/kit', revision: 'deadbee' },
        modules: [
          {
            id: 'base',
            title: 'Base',
            description: 'D',
            version: '1.0.0',
            paths: ['nuxt.config.ts'],
          },
        ],
      },
    );
    expect((await loadRegistryFromKit(kitRoot))?.kit.revision).toBe('deadbee');
  });

  it('returns null when the kit carries no registry', async () => {
    expect(await loadRegistryFromKit(await makeTempDir('kit'))).toBeNull();
  });
});
