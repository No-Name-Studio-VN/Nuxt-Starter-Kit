import { describe, expect, it } from 'vitest';
import { parseRegistry, type Registry } from '../../src/registry/schema';
import { blockDeclarations, reachableModules } from './markers';

const named = (source: string): Array<[string, string]> =>
  blockDeclarations(source, 'test').map((entry) => [entry.name, entry.moduleId]);

describe('blockDeclarations', () => {
  it('finds a module-scope declaration inside a block', () => {
    const source = [
      '// <nsk:auth>',
      'export const credentials = table();',
      'type Transports = string[];',
      '// </nsk:auth>',
    ].join('\n');
    expect(named(source)).toEqual([
      ['credentials', 'auth'],
      ['Transports', 'auth'],
    ]);
  });

  it('reports the line each declaration sits on', () => {
    const source = [
      'const outside = 1;',
      '// <nsk:pwa>',
      'const inside = 2;',
      '// </nsk:pwa>',
    ].join('\n');
    expect(blockDeclarations(source, 'test')).toEqual([
      { name: 'inside', moduleId: 'pwa', line: 2 },
    ]);
  });

  it('ignores declarations outside every block', () => {
    expect(named('const plain = 1;\n// <nsk:pwa>\n// </nsk:pwa>')).toEqual([]);
  });

  /**
   * The restriction that keeps this usable: a local in one function and an
   * unrelated local of the same name in another are not the same binding.
   */
  it('ignores a local declared inside a function body', () => {
    const source = [
      '// <nsk:auth>',
      'export function check() {',
      '  const db = connect();',
      '  return db;',
      '}',
      '// </nsk:auth>',
    ].join('\n');
    expect(named(source)).toEqual([['check', 'auth']]);
  });

  it('finds a re-export list entry inside a block', () => {
    const source = [
      'export type {',
      '  DBAuthToken,',
      '  // <nsk:auth>',
      '  DBPasskey,',
      '  // </nsk:auth>',
      "} from '~~/types/db/database';",
    ].join('\n');
    expect(named(source)).toEqual([['DBPasskey', 'auth']]);
  });

  it('does not treat a bare identifier outside an export list as a declaration', () => {
    const source = ['const list = [', '// <nsk:pwa>', '  someValue,', '// </nsk:pwa>', '];'].join(
      '\n',
    );
    expect(named(source)).toEqual([]);
  });

  it('returns nothing for a file with no markers', () => {
    expect(blockDeclarations('export const a = 1;', 'test')).toEqual([]);
  });
});

function makeRegistry(modules: Array<Record<string, unknown>>): Registry {
  return parseRegistry(
    {
      schemaVersion: 2,
      version: '1.0.0',
      kit: { template: 'github:acme/kit', revision: 'abc1234' },
      modules: modules.map((module) => ({
        title: 'T',
        description: 'D',
        version: '1.0.0',
        paths: ['x.ts'],
        ...module,
      })),
    },
    'test',
  );
}

describe('reachableModules', () => {
  const registry = makeRegistry([
    { id: 'base' },
    { id: 'database', requires: ['base'] },
    { id: 'auth', requires: ['database'] },
    { id: 'pwa', requires: ['base'] },
  ]);

  it('includes the module itself and everything it requires', () => {
    expect([...reachableModules(registry, 'auth')].sort()).toEqual(['auth', 'base', 'database']);
  });

  it('does not reach sideways to a sibling', () => {
    expect(reachableModules(registry, 'pwa').has('database')).toBe(false);
  });

  it('does not reach upwards to a dependant', () => {
    expect(reachableModules(registry, 'database').has('auth')).toBe(false);
  });
});
