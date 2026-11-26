import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliError } from '../../src/errors';
import { readKitConfig } from '../../src/kit/config';
import {
  dependentsOf,
  projectInitSelection,
  readKitModules,
  resolveSelection,
  validateSelection,
} from '../../src/kit/modules';
import { printModulesJson } from '../../src/report';
import { writeJsonAtomically, writeTextFile } from '../../src/util/fs';
import { makeTempDir } from '../support/fixtureKit';
import { kitRoot as realKitRoot } from './imports';

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
  await writeJsonAtomically(join(kitRoot, 'packages/create-nuxt-saas/kit.json'), { exclude: [] });
  await writeModule('c', { requires: ['b'], internal: true });
  await writeModule('b', { requires: ['a'] });
  await writeModule('a', { requires: [] });
});

afterEach(async () => {
  await rm(kitRoot, { recursive: true, force: true });
});

describe('real kit catalog', () => {
  it('reports Essentials first and Miscellaneous last with independently selectable modules', async () => {
    const config = await readKitConfig(realKitRoot);
    const modules = await readKitModules(realKitRoot, config);
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      printModulesJson(modules, [], 'a'.repeat(40), config.groups);
      const output = stdout.mock.calls[0]?.[0];
      const report: unknown = JSON.parse(String(output));
      expect(report).toMatchObject({
        groups: ['Essentials', 'Foundation', 'Authentication', 'App', 'Content', 'Miscellaneous'],
        modules: expect.arrayContaining([
          expect.objectContaining({ id: 'server-core', group: 'Essentials', internal: false }),
          expect.objectContaining({ id: 'database', group: 'Essentials', internal: false }),
          expect.objectContaining({ id: 'cache', group: 'Miscellaneous', internal: false }),
          expect.objectContaining({ id: 'kv', group: 'Miscellaneous', internal: false }),
          expect.objectContaining({ id: 'email', group: 'Miscellaneous', internal: false }),
          expect.objectContaining({ id: 'bot-protection', group: 'Foundation' }),
          expect.objectContaining({
            id: 'auth-email-verification',
            group: 'Authentication',
            parent: 'auth-password',
            internal: false,
          }),
        ]),
      });
    } finally {
      stdout.mockRestore();
    }
  });

  it('resolves password sign-in with email transport but without optional email verification', async () => {
    const modules = await readKitModules(realKitRoot);
    const defaults = modules.filter((module) => module.installByDefault).map((module) => module.id);
    const selected = resolveSelection(modules, [...defaults, 'auth-password']);

    expect(() => validateSelection(modules, selected)).not.toThrow();
    expect(selected).toEqual(expect.arrayContaining(['auth-password', 'email']));
    expect(selected).not.toContain('auth-email-verification');
  });
});

describe('projectInitSelection', () => {
  it('projects password sign-in and explains required layers without adding email verification', async () => {
    const modules = await readKitModules(realKitRoot);
    const preview = projectInitSelection(modules, ['auth-password']);

    expect([...preview.effective].sort()).toEqual([
      'auth',
      'auth-password',
      'database',
      'email',
      'server-core',
      'web-security',
    ]);
    expect(preview.requiredBy.get('email')).toEqual(['auth-password']);
    expect(preview.requiredBy.get('database')).toEqual(['auth']);
    expect(preview.missing).toEqual([]);
  });

  it('keeps manually selected email when password sign-in is removed', async () => {
    const modules = await readKitModules(realKitRoot);
    expect(
      projectInitSelection(modules, ['auth-password', 'email']).requiredBy.get('email'),
    ).toEqual(['auth-password']);

    const preview = projectInitSelection(modules, ['email']);
    expect([...preview.effective].sort()).toEqual(['email', 'web-security']);
    expect(preview.requiredBy.has('email')).toBe(false);
  });

  it('keeps a shared requirement when one of its consumers is removed', async () => {
    const modules = await readKitModules(realKitRoot);
    expect(
      projectInitSelection(modules, ['auth-password', 'auth-oauth']).requiredBy.get('auth'),
    ).toEqual(['auth-oauth', 'auth-password']);

    const preview = projectInitSelection(modules, ['auth-oauth']);
    expect(preview.effective).toContain('auth');
    expect(preview.requiredBy.get('auth')).toEqual(['auth-oauth']);
  });

  it('reports the alternatives for passkeys and accepts OAuth without adding email', async () => {
    const modules = await readKitModules(realKitRoot);
    const incomplete = projectInitSelection(modules, ['auth-passkeys']);
    expect(incomplete.missing).toMatchObject([
      { id: 'auth', requiresOneOf: ['auth-password', 'auth-oauth'] },
    ]);
    expect(incomplete.effective).not.toContain('auth-password');
    expect(incomplete.effective).not.toContain('auth-oauth');

    const preview = projectInitSelection(modules, ['auth-passkeys', 'auth-oauth']);
    expect(preview.missing).toEqual([]);
    expect(preview.effective).toContain('auth-oauth');
    expect(preview.effective).not.toContain('email');
  });

  it('includes default modules and their hard requirements with no explicit picks', async () => {
    await writeModule('b', { installByDefault: true, requires: ['a'] });
    const modules = await readKitModules(kitRoot);
    const preview = projectInitSelection(modules, []);

    expect(preview.defaults).toEqual(['b']);
    expect(preview.effective).toEqual(['a', 'b']);
    expect(preview.requiredBy.get('a')).toEqual(['b']);
  });
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
      requiresOneOf: [],
      internal: false,
      dependencies: [],
      devDependencies: [],
      scripts: [],
      env: [],
      bindings: [],
      rootFiles: [],
      changes: [],
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
      requiresOneOf: [],
      internal: false,
      dependencies: ['h3'],
      devDependencies: ['typescript'],
      scripts: ['db:generate'],
      env: ['API_KEY'],
      bindings: ['DB'],
      rootFiles: ['server/api/health.get.ts'],
      changes: [],
    });
  });

  it('defaults an omitted requires field', async () => {
    await writeModule('a');
    expect((await readKitModules(kitRoot))[0]?.requires).toEqual([]);
  });

  it.each([
    [{ group: 'Unknown' }, /a.*unknown group "Unknown"/i],
    [{}, /a.*must declare a group/i],
    [{ group: 'App', parent: 'b' }, /a.*parent "b".*requires/i],
    [{ group: 'App', parent: 'b', requires: ['b'] }, /a.*parent "b".*same group/i],
    [{ group: 'App', parent: 'missing' }, /a.*unknown parent "missing"/i],
    [{ group: 'App', requiresOneOf: ['missing'] }, /a.*unknown module "missing".*requiresOneOf/i],
  ])('rejects invalid catalogue metadata %j', async (metadata, message) => {
    await writeJsonAtomically(join(kitRoot, 'packages/create-nuxt-saas/kit.json'), {
      exclude: [],
      groups: ['App', 'Other'],
    });
    await writeModule('a', metadata);
    await writeModule('b', { group: 'Other' });
    await expect(readKitModules(kitRoot)).rejects.toThrow(message);
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
