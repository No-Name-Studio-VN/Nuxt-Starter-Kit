import { describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import { resolveModules } from '../../src/registry/resolve';
import {
  parseRegistry,
  pickableModules,
  type Registry,
  requiredModuleIds,
} from '../../src/registry/schema';

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

describe('required modules', () => {
  it('installs a required module even when nothing asks for it', () => {
    const registry = makeRegistry([{ id: 'base', required: true }, { id: 'standalone' }]);
    expect(resolveModules(registry, ['standalone']).map((module) => module.id)).toEqual([
      'base',
      'standalone',
    ]);
  });

  it('accepts an empty selection, because required modules make a project', () => {
    const registry = makeRegistry([{ id: 'base', required: true }, { id: 'pwa' }]);
    expect(resolveModules(registry, []).map((module) => module.id)).toEqual(['base']);
  });

  it('does not duplicate a required module that was also asked for', () => {
    const registry = makeRegistry([{ id: 'base', required: true }]);
    expect(resolveModules(registry, ['base']).map((module) => module.id)).toEqual(['base']);
  });

  it('still refuses an empty selection when no module is required', () => {
    expect(() => resolveModules(makeRegistry([{ id: 'base' }]), [])).toThrow(CliError);
  });

  it('lists required modules', () => {
    const registry = makeRegistry([{ id: 'base', required: true }, { id: 'pwa' }]);
    expect(requiredModuleIds(registry)).toEqual(['base']);
  });
});

describe('pickableModules', () => {
  it('hides required and internal modules from the picker', () => {
    const registry = makeRegistry([
      { id: 'base', required: true },
      { id: 'server-core', internal: true, requires: ['base'] },
      { id: 'database', requires: ['server-core'] },
      { id: 'pwa', requires: ['base'] },
    ]);
    expect(pickableModules(registry).map((module) => module.id)).toEqual(['database', 'pwa']);
  });

  it('offers everything when nothing is flagged', () => {
    const registry = makeRegistry([{ id: 'base' }, { id: 'pwa' }]);
    expect(pickableModules(registry).map((module) => module.id)).toEqual(['base', 'pwa']);
  });
});

describe('flag validation', () => {
  it('defaults both flags to false', () => {
    const [module] = makeRegistry([{ id: 'base' }]).modules;
    expect(module?.required).toBe(false);
    expect(module?.internal).toBe(false);
  });

  it('refuses a module that is both required and internal', () => {
    expect(() => makeRegistry([{ id: 'base', required: true, internal: true }])).toThrow(
      /both required and internal/i,
    );
  });
});
