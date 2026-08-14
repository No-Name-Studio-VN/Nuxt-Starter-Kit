import { describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import { resolveModules } from '../../src/registry/resolve';
import { parseRegistry, type Registry } from '../../src/registry/schema';

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

describe('resolveModules', () => {
  it('pulls in transitive dependencies, dependencies first', () => {
    const registry = makeRegistry([
      { id: 'base' },
      { id: 'database', requires: ['base'] },
      { id: 'auth', requires: ['database'] },
      { id: 'admin-users', requires: ['auth'] },
    ]);
    expect(resolveModules(registry, ['admin-users']).map((module) => module.id)).toEqual([
      'base',
      'database',
      'auth',
      'admin-users',
    ]);
  });

  it('deduplicates shared dependencies', () => {
    const registry = makeRegistry([
      { id: 'base' },
      { id: 'content', requires: ['base'] },
      { id: 'pwa', requires: ['base'] },
    ]);
    expect(resolveModules(registry, ['content', 'pwa']).map((module) => module.id)).toEqual([
      'base',
      'content',
      'pwa',
    ]);
  });

  it('rejects dependency cycles', () => {
    const registry = makeRegistry([
      { id: 'one', requires: ['two'] },
      { id: 'two', requires: ['one'] },
    ]);
    expect(() => resolveModules(registry, ['one'])).toThrow(/cycle/i);
  });

  it('rejects conflicting modules', () => {
    const registry = makeRegistry([
      { id: 'base' },
      { id: 'sqlite', requires: ['base'], conflicts: ['postgres'] },
      { id: 'postgres', requires: ['base'] },
    ]);
    expect(() => resolveModules(registry, ['sqlite', 'postgres'])).toThrow(
      /cannot be installed together/,
    );
  });

  it('requires at least one module', () => {
    expect(() => resolveModules(makeRegistry([{ id: 'base' }]), [])).toThrow(CliError);
  });
});
