import { describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import { getModule, parseRegistry } from '../../src/registry/schema';

function registry(modules: unknown[]) {
  return {
    schemaVersion: 2,
    version: '1.0.0',
    kit: { template: 'github:No-Name-Studio-VN/Nuxt-Starter-Kit', revision: 'abc1234' },
    modules,
  };
}

const base = {
  id: 'base',
  title: 'Base',
  description: 'Foundation',
  version: '1.0.0',
  paths: ['nuxt.config.ts'],
};

describe('parseRegistry', () => {
  it('applies defaults for optional collections', () => {
    const parsed = parseRegistry(registry([base]), 'test');
    const parsedModule = parsed.modules[0]!;
    expect(parsedModule.requires).toEqual([]);
    expect(parsedModule.conflicts).toEqual([]);
    expect(parsedModule.env).toEqual([]);
    expect(parsedModule.notes).toEqual([]);
    expect(parsedModule.structured).toEqual({});
  });

  it('keeps declared dependency and structured data', () => {
    const parsed = parseRegistry(
      registry([
        base,
        {
          id: 'auth',
          title: 'Auth',
          description: 'Sessions',
          version: '1.0.0',
          paths: ['server/api/auth/**'],
          requires: ['base'],
          structured: { 'package.json': { dependencies: { 'nuxt-auth-utils': '^0.5.29' } } },
          env: ['NUXT_SESSION_PASSWORD'],
        },
      ]),
      'test',
    );
    expect(parsed.modules[1]!.requires).toEqual(['base']);
    expect(parsed.modules[1]!.structured['package.json']).toEqual({
      dependencies: { 'nuxt-auth-utils': '^0.5.29' },
    });
  });

  it.each([
    [registry([{ ...base, id: 'Base' }]), 'uppercase id'],
    [registry([base, base]), 'duplicate id'],
    [registry([{ ...base, requires: ['ghost'] }]), 'unknown dependency'],
    [registry([{ ...base, paths: ['../outside/**'] }]), 'escaping path'],
    [registry([]), 'no modules'],
    [{ ...registry([base]), schemaVersion: 1 }, 'wrong schema version'],
  ])('rejects %#: %s', (value) => {
    expect(() => parseRegistry(value, 'test')).toThrow(CliError);
  });

  it('names the offending field in the error', () => {
    expect(() => parseRegistry(registry([{ ...base, version: 42 }]), 'test')).toThrow(/version/);
  });
});

describe('getModule', () => {
  it('throws a helpful error for an unknown id', () => {
    const parsed = parseRegistry(registry([base]), 'test');
    expect(() => getModule(parsed, 'nope')).toThrow(/Unknown module "nope"/);
  });
});
