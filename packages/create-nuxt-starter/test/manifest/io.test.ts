import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import { buildManifest, MANIFEST_PATH, readManifest, writeManifest } from '../../src/manifest/io';
import { resolveModules } from '../../src/registry/resolve';
import { writeJsonAtomically, writeTextFile } from '../../src/util/fs';
import { loadFixtureRegistry, makeTempDir } from '../support/fixtureKit';

async function sampleManifest() {
  const registry = await loadFixtureRegistry();
  const modules = resolveModules(registry, ['content']);
  return buildManifest({
    kit: registry.kit,
    placeholders: { PROJECT_NAME: 'my-app' },
    modules,
    rendered: [
      { path: 'nuxt.config.ts', moduleId: 'base', hash: 'sha256:aaa' },
      { path: 'content.config.ts', moduleId: 'content', hash: 'sha256:bbb' },
    ],
  });
}

describe('buildManifest', () => {
  it('groups rendered files under their owning module', async () => {
    const manifest = await sampleManifest();
    expect(manifest.modules.map((module) => module.id)).toEqual(['base', 'content']);
    expect(manifest.modules[0]!.files).toEqual({ 'nuxt.config.ts': 'sha256:aaa' });
    expect(manifest.modules[1]!.files).toEqual({ 'content.config.ts': 'sha256:bbb' });
    expect(manifest.modules[0]!.orphaned).toEqual([]);
  });

  it('records the kit revision, placeholders, and versions', async () => {
    const manifest = await sampleManifest();
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.renderVersion).toBe(1);
    expect(manifest.kit.revision).toBe('v1');
    expect(manifest.placeholders).toEqual({ PROJECT_NAME: 'my-app' });
  });
});

describe('readManifest / writeManifest', () => {
  it('round-trips through disk', async () => {
    const projectRoot = await makeTempDir('manifest');
    const manifest = await sampleManifest();
    await writeManifest(projectRoot, manifest);
    expect(await readManifest(projectRoot)).toEqual(manifest);
  });

  it('explains that a directory is not a starter project', async () => {
    const projectRoot = await makeTempDir('manifest');
    await expect(readManifest(projectRoot)).rejects.toThrow(/not a Nuxt Starter Kit project/);
  });

  it('rejects a corrupted manifest with a readable error', async () => {
    const projectRoot = await makeTempDir('manifest');
    await writeJsonAtomically(join(projectRoot, MANIFEST_PATH), {
      schemaVersion: 1,
      modules: 'nope',
    });
    await expect(readManifest(projectRoot)).rejects.toThrow(CliError);
  });

  it('rejects unparseable JSON', async () => {
    const projectRoot = await makeTempDir('manifest');
    await writeTextFile(join(projectRoot, MANIFEST_PATH), '{ not json');
    await expect(readManifest(projectRoot)).rejects.toThrow(/Unable to read/);
  });
});
