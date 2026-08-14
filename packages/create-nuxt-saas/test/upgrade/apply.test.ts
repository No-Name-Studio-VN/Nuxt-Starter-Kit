import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readManifest } from '../../src/manifest/io';
import { applyUpgrade } from '../../src/upgrade/apply';
import { planUpgrade } from '../../src/upgrade/plan';
import { hashContent, pathExists } from '../../src/util/fs';
import { loadFixtureRegistryV2 } from '../support/fixtureKit';
import { must } from '../support/must';
import {
  commitAll,
  editFile,
  generateProjectAtV1,
  resolveFixtureKit,
} from '../support/upgradeFixture';

async function upgrade(projectRoot: string) {
  const registry = await loadFixtureRegistryV2();
  const plan = await planUpgrade({
    projectRoot,
    registry,
    targetRevision: registry.kit.revision,
    resolveLocalKit: resolveFixtureKit,
  });
  try {
    return await applyUpgrade(plan, registry);
  } finally {
    await plan.cleanup();
  }
}

describe('applyUpgrade', () => {
  it('writes upstream changes and removes deleted files', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    const result = await upgrade(projectRoot);

    expect(await readFile(join(projectRoot, 'app/pages/index.vue'), 'utf8')).toContain(
      'Welcome home',
    );
    expect(await pathExists(join(projectRoot, 'app/pages/about.vue'))).toBe(true);
    expect(await pathExists(join(projectRoot, 'app/legacy.ts'))).toBe(false);
    expect(result.deleted).toContain('app/legacy.ts');
  });

  it('records the new revision and module versions in the manifest', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await upgrade(projectRoot);

    const manifest = await readManifest(projectRoot);
    expect(manifest.kit.revision).toBe('v2');
    expect(must(manifest.modules.find((module) => module.id === 'content')).version).toBe('2.0.0');
  });

  it('stores pristine target hashes so the next upgrade sees unmodified files', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await upgrade(projectRoot);

    const manifest = await readManifest(projectRoot);
    const recorded = must(manifest.modules.find((module) => module.id === 'base')).files[
      'app/pages/index.vue'
    ];
    const onDisk = hashContent(await readFile(join(projectRoot, 'app/pages/index.vue'), 'utf8'));
    expect(recorded).toBe(onDisk);
  });

  it('drops manifest entries for files that no longer exist upstream', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await upgrade(projectRoot);

    const manifest = await readManifest(projectRoot);
    const base = must(manifest.modules.find((module) => module.id === 'base'));
    expect(Object.keys(base.files)).not.toContain('app/legacy.ts');
    expect(Object.keys(base.files)).toContain('app/pages/about.vue');
  });

  it('upgrades package.json structurally', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await upgrade(projectRoot);

    const packageJson: unknown = JSON.parse(
      await readFile(join(projectRoot, 'package.json'), 'utf8'),
    );
    expect(packageJson).toMatchObject({
      dependencies: { '@nuxt/content': '^3.2.0', '@nuxtjs/mdc': '^0.10.0' },
    });
  });

  it('leaves a dependency the user pinned themselves', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    const packageJsonPath = join(projectRoot, 'package.json');
    const original: unknown = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    const edited = {
      ...(typeof original === 'object' && original !== null ? original : {}),
      dependencies: { '@nuxt/content': '3.0.5-my-fork' },
    };
    await editFile(projectRoot, 'package.json', `${JSON.stringify(edited, null, 2)}\n`);
    await commitAll(projectRoot);

    const result = await upgrade(projectRoot);
    const packageJson: unknown = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    expect(packageJson).toMatchObject({ dependencies: { '@nuxt/content': '3.0.5-my-fork' } });
    expect(result.structured.some((change) => change.type === 'skip')).toBe(true);
  });

  it('writes conflict markers and reports the file', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(
      projectRoot,
      'app/pages/index.vue',
      '<template>\n  <h1>My page</h1>\n</template>\n',
    );
    await commitAll(projectRoot);

    const result = await upgrade(projectRoot);
    expect(result.conflicted).toEqual(['app/pages/index.vue']);
    expect(await readFile(join(projectRoot, 'app/pages/index.vue'), 'utf8')).toContain(
      '<<<<<<< local',
    );
  });

  it('keeps an edited file that upstream deleted and marks it orphaned', async () => {
    const projectRoot = await generateProjectAtV1(['base']);
    await editFile(projectRoot, 'app/legacy.ts', "export const legacyHelper = 'mine';\n");
    await commitAll(projectRoot);

    const result = await upgrade(projectRoot);
    expect(await pathExists(join(projectRoot, 'app/legacy.ts'))).toBe(true);
    expect(result.orphaned).toContain('app/legacy.ts');

    const manifest = await readManifest(projectRoot);
    expect(must(manifest.modules.find((module) => module.id === 'base')).orphaned).toContain(
      'app/legacy.ts',
    );
  });

  it('is idempotent — upgrading again plans nothing', async () => {
    const projectRoot = await generateProjectAtV1(['content']);
    await upgrade(projectRoot);
    const second = await upgrade(projectRoot);
    expect(second.written).toEqual([]);
    expect(second.deleted).toEqual([]);
    expect(second.structured.filter((change) => change.type !== 'skip')).toEqual([]);
  });
});
