import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveModules } from '../../src/registry/resolve';
import { renderKit } from '../../src/render/render';
import { listFiles } from '../../src/util/fs';
import { FIXTURE_KIT_V1_ROOT, loadFixtureRegistry, makeTempDir } from '../support/fixtureKit';

async function render(ids: string[]) {
  const registry = await loadFixtureRegistry();
  const destinationRoot = await makeTempDir('render');
  const files = await renderKit({
    kitRoot: FIXTURE_KIT_V1_ROOT,
    modules: resolveModules(registry, ids),
    placeholders: { PROJECT_NAME: 'my-app', PROJECT_DESCRIPTION: 'A test app' },
    destinationRoot,
  });
  return { destinationRoot, files };
}

describe('renderKit', () => {
  it("emits only the selected modules' files and never the registry", async () => {
    const { destinationRoot } = await render(['base']);
    expect(await listFiles(destinationRoot)).toEqual([
      'app/app.vue',
      'app/legacy.ts',
      'app/pages/index.vue',
      'nuxt.config.ts',
      'package.json',
    ]);
  });

  it('adds files owned by additional modules', async () => {
    const { destinationRoot } = await render(['content']);
    expect(await listFiles(destinationRoot)).toContain('content.config.ts');
  });

  it('strips unselected marker blocks from shared files', async () => {
    const { destinationRoot } = await render(['content']);
    const config = await readFile(join(destinationRoot, 'nuxt.config.ts'), 'utf8');
    expect(config).toContain("'@nuxt/content'");
    expect(config).not.toContain('@vite-pwa/nuxt');
    expect(config).toContain('// <nsk:content>');
  });

  it('substitutes placeholders', async () => {
    const { destinationRoot } = await render(['base']);
    const packageJson = JSON.parse(await readFile(join(destinationRoot, 'package.json'), 'utf8'));
    expect(packageJson.name).toBe('my-app');
    expect(packageJson.description).toBe('A test app');
  });

  it('attributes each file to its owning module and hashes it', async () => {
    const { files } = await render(['content']);
    const contentConfig = files.find((file) => file.path === 'content.config.ts');
    expect(contentConfig?.moduleId).toBe('content');
    expect(contentConfig?.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(files.find((file) => file.path === 'nuxt.config.ts')?.moduleId).toBe('base');
  });

  it('is deterministic — the same inputs produce the same hashes', async () => {
    const first = await render(['content', 'pwa']);
    const second = await render(['content', 'pwa']);
    expect(first.files).toEqual(second.files);
  });

  it('rejects a module whose declared path matches nothing', async () => {
    const registry = await loadFixtureRegistry();
    const modules = resolveModules(registry, ['base']).map((module) =>
      module.id === 'base' ? { ...module, paths: [...module.paths, 'does/not/exist.ts'] } : module,
    );
    await expect(
      renderKit({
        kitRoot: FIXTURE_KIT_V1_ROOT,
        modules,
        placeholders: {},
        destinationRoot: await makeTempDir('render'),
      }),
    ).rejects.toThrow(/does\/not\/exist\.ts/);
  });

  it('rejects two modules claiming the same file', async () => {
    const registry = await loadFixtureRegistry();
    const modules = resolveModules(registry, ['content']).map((module) =>
      module.id === 'content' ? { ...module, paths: [...module.paths, 'nuxt.config.ts'] } : module,
    );
    await expect(
      renderKit({
        kitRoot: FIXTURE_KIT_V1_ROOT,
        modules,
        placeholders: {},
        destinationRoot: await makeTempDir('render'),
      }),
    ).rejects.toThrow(/claimed by both/);
  });
});
