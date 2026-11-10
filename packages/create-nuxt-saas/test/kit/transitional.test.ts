import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readKitModules, resolveSelection, type KitModule } from '../../src/kit/modules';
import { writeJsonAtomically } from '../../src/util/fs';
import { boundaryModules } from './imports';

// Removed in Task 15 together with the transitional registry fallback.
const registryAuth: KitModule = {
  id: 'auth',
  title: 'Auth',
  description: 'An unpeeled registry-owned module',
  requires: [],
  internal: false,
  dependencies: [],
  devDependencies: [],
  scripts: [],
  env: [],
  bindings: [],
  rootFiles: [],
};

let fixtureRoot: string;

function writeLayer(requires: string[]): Promise<void> {
  return writeJsonAtomically(join(fixtureRoot, 'layers/peeled/module.json'), {
    title: 'Peeled layer',
    description: 'A layer depending on an unpeeled module',
    requires,
  });
}

beforeEach(async () => {
  fixtureRoot = await mkdtemp(join(tmpdir(), 'nsk-transitional-'));
  await writeLayer(['auth']);
});

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe('transitional module graph', () => {
  it('allows a peeled layer to require unpeeled non-base auth', async () => {
    const modules = await boundaryModules(fixtureRoot, [registryAuth]);
    expect(resolveSelection(modules, ['peeled'])).toEqual(['auth', 'peeled']);
    // The permanent layers-only reader must remain strict.
    await expect(readKitModules(fixtureRoot)).rejects.toThrow(/requires unknown module "auth"/);
  });

  it('rejects a layer requirement missing from both metadata sources', async () => {
    await writeLayer(['missing']);
    await expect(boundaryModules(fixtureRoot, [registryAuth])).rejects.toThrow(
      /Unknown module "missing"/,
    );
  });

  it('validates requirements of every registry-owned module in the merged graph', async () => {
    const broken = { ...registryAuth, id: 'broken', requires: ['missing'] };
    await expect(boundaryModules(fixtureRoot, [registryAuth, broken])).rejects.toThrow(
      /Unknown module "missing"/,
    );
  });

  it('rejects a cycle spanning layer and registry-owned modules', async () => {
    await expect(
      boundaryModules(fixtureRoot, [{ ...registryAuth, requires: ['peeled'] }]),
    ).rejects.toThrow(/cycle/);
  });
});
