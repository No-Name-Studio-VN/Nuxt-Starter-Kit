import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { KitModule } from '../../src/kit/modules';
import { kitRoot, readLayerModules, trackedMatches } from './imports';

const packageSchema = z.object({
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
  scripts: z.record(z.string(), z.string()).default({}),
});

const claimSections: Array<
  keyof Pick<
    KitModule,
    'dependencies' | 'devDependencies' | 'scripts' | 'env' | 'bindings' | 'rootFiles'
  >
> = ['dependencies', 'devDependencies', 'scripts', 'env', 'bindings', 'rootFiles'];

describe('kit module claims', () => {
  it('never declares the same package as both a dependency and a devDependency', async () => {
    const packageJson: unknown = JSON.parse(await readFile(join(kitRoot, 'package.json'), 'utf8'));
    const rootPackage = packageSchema.parse(packageJson);
    const duplicates = Object.keys(rootPackage.dependencies).filter((name) =>
      Object.hasOwn(rootPackage.devDependencies, name),
    );
    expect(
      duplicates,
      `Packages declared in both dependency sections: ${duplicates.join(', ')}`,
    ).toEqual([]);
  });

  it('claims existing root entries and never shares a claim between modules', async () => {
    const modules = await readLayerModules();
    const packageJson: unknown = JSON.parse(await readFile(join(kitRoot, 'package.json'), 'utf8'));
    const rootPackage = packageSchema.parse(packageJson);
    const env = await readFile(join(kitRoot, '.env.example'), 'utf8');
    const envKeys = new Set([...env.matchAll(/^([A-Z_]\w*)=/gim)].map((match) => match[1]));
    const wrangler = await readFile(join(kitRoot, 'wrangler.jsonc'), 'utf8');
    const bindings = new Set(
      [...wrangler.matchAll(/"binding"\s*:\s*"([^"]+)"/g)].map((match) => match[1]),
    );
    const available = new Map([
      ['dependencies', new Set(Object.keys(rootPackage.dependencies))],
      ['devDependencies', new Set(Object.keys(rootPackage.devDependencies))],
      ['scripts', new Set(Object.keys(rootPackage.scripts))],
      ['env', envKeys],
      ['bindings', bindings],
    ]);
    const owners = new Map<string, string>();
    const violations: string[] = [];

    for (const module of modules) {
      for (const section of claimSections) {
        for (const name of module[section]) {
          // A package name is the same claim in either dependency section.
          const namespace = section === 'devDependencies' ? 'dependencies' : section;
          const key = `${namespace}:${name}`;
          const previous = owners.get(key);
          if (previous && previous !== module.id) {
            violations.push(`${module.id}:${section}:${name} also claimed by ${previous}`);
          }
          owners.set(key, module.id);
          const exists =
            section === 'rootFiles'
              ? (await trackedMatches(name)).length > 0
              : available.get(section)?.has(name);
          if (!exists) violations.push(`${module.id}:${section}:${name} missing from root kit`);
        }
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
