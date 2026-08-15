import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runInit } from '../../src/commands/init';
import { readManifest } from '../../src/manifest/io';
import { hashContent, listFiles, writeTextFile } from '../../src/util/fs';
import { FIXTURE_KIT_V1_ROOT, loadFixtureRegistry, makeTempDir } from '../support/fixtureKit';
import { must } from '../support/must';

async function init(moduleIds: string[], targetDir?: string) {
  const registry = await loadFixtureRegistry();
  return runInit({
    registry,
    targetDir: targetDir ?? join(await makeTempDir('init'), 'my-app'),
    moduleIds,
    placeholders: { PROJECT_NAME: 'my-app', PROJECT_DESCRIPTION: 'Test' },
    localKitRoot: FIXTURE_KIT_V1_ROOT,
  });
}

describe('runInit', () => {
  it('generates the selected modules plus their dependencies', async () => {
    const result = await init(['pwa']);
    expect(result.moduleIds).toEqual(['base', 'pwa']);
    expect(await listFiles(result.projectRoot)).toEqual([
      '.nuxt-saas/manifest.json',
      'app/app.vue',
      'app/components/InstallPrompter.vue',
      'app/legacy.ts',
      'app/pages/index.vue',
      'nuxt.config.ts',
      'package.json',
    ]);
  });

  it('writes a manifest describing what was installed', async () => {
    const result = await init(['content']);
    const manifest = await readManifest(result.projectRoot);
    expect(manifest.modules.map((module) => module.id)).toEqual(['base', 'content']);
    expect(manifest.kit.revision).toBe('v1');
    expect(manifest.placeholders.PROJECT_NAME).toBe('my-app');
    expect(Object.keys(must(manifest.modules[1]).files)).toEqual(['content.config.ts']);
  });

  it('merges structured fragments of installed modules into package.json', async () => {
    const result = await init(['content', 'pwa']);
    const packageJson = JSON.parse(
      await readFile(join(result.projectRoot, 'package.json'), 'utf8'),
    );
    expect(packageJson.dependencies).toEqual({
      '@nuxt/content': '^3.0.0',
      '@vite-pwa/nuxt': '^1.0.0',
    });
    expect(packageJson.name).toBe('my-app');
  });

  it("drops unselected modules' entries from shared JSON files", async () => {
    const result = await init(['base']);
    const packageJson = JSON.parse(
      await readFile(join(result.projectRoot, 'package.json'), 'utf8'),
    );
    expect(packageJson.dependencies).toEqual({});
  });

  it('keeps an entry a selected module still declares', async () => {
    const result = await init(['content']);
    const packageJson = JSON.parse(
      await readFile(join(result.projectRoot, 'package.json'), 'utf8'),
    );
    expect(packageJson.dependencies).toEqual({ '@nuxt/content': '^3.0.0' });
  });

  // The kit cannot hold {{PROJECT_NAME}} in this field and still install, so the
  // module declares it and the structured pass substitutes on the way in.
  it('substitutes placeholders in structured values', async () => {
    const result = await init(['base']);
    const packageJson = JSON.parse(
      await readFile(join(result.projectRoot, 'package.json'), 'utf8'),
    );
    expect(packageJson.name).toBe('my-app');
  });

  it('surfaces module notes', async () => {
    const result = await init(['pwa']);
    expect(result.notes).toContain('Generate PWA icons before deploying.');
  });

  it('refuses to generate into a non-empty directory', async () => {
    const targetDir = await makeTempDir('init-existing');
    await writeTextFile(join(targetDir, 'README.md'), 'mine');
    await expect(init(['base'], targetDir)).rejects.toThrow(/not empty/);
  });

  it('generates into an existing empty directory', async () => {
    const targetDir = await makeTempDir('init-empty');
    const result = await init(['base'], targetDir);
    expect(result.projectRoot).toBe(targetDir);
  });
});

describe('manifest hashes', () => {
  it('records the post-merge hash of structured targets', async () => {
    const result = await init(['content']);
    const manifest = await readManifest(result.projectRoot);
    const recorded = must(manifest.modules.find((module) => module.id === 'base')).files[
      'package.json'
    ];
    const onDisk = hashContent(await readFile(join(result.projectRoot, 'package.json'), 'utf8'));
    expect(recorded).toBe(onDisk);
  });

  it('records the render hash of untouched files', async () => {
    const result = await init(['content']);
    const manifest = await readManifest(result.projectRoot);
    const recorded = must(manifest.modules.find((module) => module.id === 'base')).files[
      'nuxt.config.ts'
    ];
    const onDisk = hashContent(await readFile(join(result.projectRoot, 'nuxt.config.ts'), 'utf8'));
    expect(recorded).toBe(onDisk);
  });
});

describe('structured provenance', () => {
  it('records what each module contributed to shared JSON files', async () => {
    const result = await init(['content', 'pwa']);
    const manifest = await readManifest(result.projectRoot);
    const content = must(manifest.modules.find((module) => module.id === 'content'));
    const pwa = must(manifest.modules.find((module) => module.id === 'pwa'));
    expect(content.structured['package.json']).toEqual({
      dependencies: { '@nuxt/content': '^3.0.0' },
    });
    expect(pwa.structured['package.json']).toEqual({
      dependencies: { '@vite-pwa/nuxt': '^1.0.0' },
    });
    // Stored as authored: the token, not the substituted value, so an upgrade can
    // still tell what the module put there.
    expect(must(manifest.modules.find((module) => module.id === 'base')).structured).toEqual({
      'package.json': { name: '{{PROJECT_NAME}}' },
    });
  });
});
