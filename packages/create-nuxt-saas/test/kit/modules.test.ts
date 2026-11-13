import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import { dependentsOf, readKitModules, resolveSelection } from '../../src/kit/modules';
import { writeJsonAtomically, writeTextFile } from '../../src/util/fs';
import { makeTempDir } from '../support/fixtureKit';

let kitRoot: string;

function writeModule(id: string, metadata: Record<string, unknown> = {}): Promise<void> {
  return writeJsonAtomically(join(kitRoot, 'layers', id, 'module.json'), {
    title: id.toUpperCase(),
    description: `Module ${id}`,
    ...metadata,
  });
}

beforeEach(async () => {
  kitRoot = await makeTempDir('kit-modules');
  await writeModule('c', { requires: ['b'], internal: true });
  await writeModule('b', { requires: ['a'] });
  await writeModule('a', { requires: [] });
});

afterEach(async () => {
  await rm(kitRoot, { recursive: true, force: true });
});

describe('readKitModules', () => {
  it('sorts by folder id and fills every default', async () => {
    const modules = await readKitModules(kitRoot);
    expect(modules.map((module) => module.id)).toEqual(['a', 'b', 'c']);
    expect(modules[0]).toEqual({
      id: 'a',
      title: 'A',
      description: 'Module a',
      requires: [],
      internal: false,
      dependencies: [],
      devDependencies: [],
      scripts: [],
      env: [],
      bindings: [],
      rootFiles: [],
    });
    expect(modules[2]?.internal).toBe(true);
  });

  it('preserves metadata and takes the id from the folder', async () => {
    await writeModule('a', {
      id: 'not-the-folder',
      dependencies: ['h3'],
      devDependencies: ['typescript'],
      scripts: ['db:generate'],
      env: ['API_KEY'],
      bindings: ['DB'],
      rootFiles: ['server/api/health.get.ts'],
    });
    expect((await readKitModules(kitRoot))[0]).toEqual({
      id: 'a',
      title: 'A',
      description: 'Module a',
      requires: [],
      internal: false,
      dependencies: ['h3'],
      devDependencies: ['typescript'],
      scripts: ['db:generate'],
      env: ['API_KEY'],
      bindings: ['DB'],
      rootFiles: ['server/api/health.get.ts'],
    });
  });

  it('defaults an omitted requires field', async () => {
    await writeModule('a');
    expect((await readKitModules(kitRoot))[0]?.requires).toEqual([]);
  });

  it('rejects requires naming a missing layer', async () => {
    await writeModule('a', { requires: ['missing'] });
    await expect(readKitModules(kitRoot)).rejects.toThrow(CliError);
    await expect(readKitModules(kitRoot)).rejects.toThrow(/requires unknown module/);
  });

  it('rejects dependency cycles when reading the kit', async () => {
    await writeModule('a', { requires: ['b'] });
    await expect(readKitModules(kitRoot)).rejects.toThrow(CliError);
    await expect(readKitModules(kitRoot)).rejects.toThrow(/cycle/);
  });

  it('rejects a layer folder without module.json and identifies its path', async () => {
    await mkdir(join(kitRoot, 'layers/x'));
    await expect(readKitModules(kitRoot)).rejects.toThrow(CliError);
    await expect(readKitModules(kitRoot)).rejects.toThrow(/layers\/x\/module\.json/);
  });

  it('wraps malformed JSON in a user-facing error with its source', async () => {
    await writeTextFile(join(kitRoot, 'layers/a/module.json'), '{');
    await expect(readKitModules(kitRoot)).rejects.toThrow(CliError);
    await expect(readKitModules(kitRoot)).rejects.toThrow(/layers\/a\/module\.json/);
  });

  it.each([
    { title: 42 },
    { description: null },
    { requires: 'b' },
    { internal: 'true' },
    { dependencies: [42] },
    { devDependencies: null },
    { scripts: {} },
    { env: [false] },
    { bindings: 'DB' },
    { rootFiles: [null] },
  ])('rejects invalid metadata %j with its source', async (metadata) => {
    await writeModule('a', metadata);
    await expect(readKitModules(kitRoot)).rejects.toThrow(CliError);
    await expect(readKitModules(kitRoot)).rejects.toThrow(/layers\/a\/module\.json/);
  });

  it('returns no modules when the layers directory is missing', async () => {
    await rm(join(kitRoot, 'layers'), { recursive: true });
    expect(await readKitModules(kitRoot)).toEqual([]);
  });

  it('wraps other layers directory read errors and identifies the path', async () => {
    const layersRoot = join(kitRoot, 'layers');
    await rm(layersRoot, { recursive: true });
    await writeTextFile(layersRoot, 'not a directory');
    await expect(readKitModules(kitRoot)).rejects.toThrow(CliError);
    await expect(readKitModules(kitRoot)).rejects.toThrow(layersRoot);
  });

  it('returns no modules for an empty layers directory', async () => {
    await rm(join(kitRoot, 'layers'), { recursive: true });
    await mkdir(join(kitRoot, 'layers'));
    expect(await readKitModules(kitRoot)).toEqual([]);
  });
});

describe('resolveSelection', () => {
  it('includes transitive dependencies before their dependents, including internal modules', async () => {
    expect(resolveSelection(await readKitModules(kitRoot), ['c'])).toEqual(['a', 'b', 'c']);
  });

  it('accepts an empty selection', async () => {
    expect(resolveSelection(await readKitModules(kitRoot), [])).toEqual([]);
  });

  it('rejects an unknown requested id', async () => {
    const modules = await readKitModules(kitRoot);
    expect(() => resolveSelection(modules, ['zzz'])).toThrow(CliError);
    expect(() => resolveSelection(modules, ['zzz'])).toThrow(/Unknown module "zzz"/);
  });

  it('deduplicates requested ids and shared dependencies', async () => {
    expect(resolveSelection(await readKitModules(kitRoot), ['b', 'c', 'b', 'a'])).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('rejects cycles in modules passed directly to the resolver', async () => {
    const modules = (await readKitModules(kitRoot)).map((module) =>
      module.id === 'a' ? { ...module, requires: ['b'] } : module,
    );
    expect(() => resolveSelection(modules, ['a'])).toThrow(CliError);
    expect(() => resolveSelection(modules, ['a'])).toThrow(/cycle/);
  });
});

describe('dependentsOf', () => {
  it('finds direct and transitive installed dependents without including the target', async () => {
    expect(dependentsOf(await readKitModules(kitRoot), ['a', 'b', 'c'], 'a')).toEqual(['b', 'c']);
  });

  it('excludes uninstalled modules and unrelated installed modules', async () => {
    await writeModule('d');
    expect(dependentsOf(await readKitModules(kitRoot), ['a', 'c', 'd'], 'a')).toEqual(['c']);
  });

  it('returns no dependents for a leaf or an empty installation', async () => {
    const modules = await readKitModules(kitRoot);
    expect(dependentsOf(modules, ['a', 'b', 'c'], 'c')).toEqual([]);
    expect(dependentsOf(modules, [], 'a')).toEqual([]);
  });
});
