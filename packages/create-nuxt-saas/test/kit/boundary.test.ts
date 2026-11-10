import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSelection } from '../../src/kit/modules';
import {
  boundaryModules,
  extractImports,
  importOwners,
  kitFiles,
  kitRoot,
  layerIds,
  ownerOf,
  targetOwner,
} from './imports';

// Existing root-kit violations under the transitional ownership rules. Remove
// entries as their modules are peeled; never add an exception for a new layer.
const knownViolations: string[] = [];

const codeFiles = kitFiles.filter((path) => /\.(?:ts|vue|js|mjs)$/.test(path));

describe('kit layer boundaries', () => {
  it('extracts static, type, re-export, side-effect and dynamic imports', () => {
    expect(
      extractImports(
        [
          "import type { User } from './user';",
          "export { value } from './value';",
          "export * from './all';",
          "import './setup';",
          "const view = import('./view.vue');",
          'import {',
          '  helper,',
          "} from './helper';",
        ].join('\n'),
      ),
    ).toEqual(['./user', './value', './all', './setup', './view.vue', './helper']);
  });

  it('attributes layer paths before transitional marker ownership', () => {
    expect(ownerOf('layers/example/app/page.vue')).toBe('example');
    expect(
      importOwners('layers/example/x.ts', "// <nsk:other>\nimport 'pkg';\n// </nsk:other>")[0]
        ?.owner,
    ).toBe('example');
    for (const comment of ['//', '<!--', '/*']) {
      expect(
        importOwners(
          'unknown.ts',
          `${comment} <nsk:auth>\nimport 'pkg';\n${comment} </nsk:auth>`,
        )[0]?.owner,
      ).toBe('auth');
    }
  });

  it('keeps global aliases in base and resolves relative layer imports', () => {
    for (const alias of ['~/', '@/', '~~/', '@@/', '#shared/']) {
      expect(targetOwner('layers/example/x.ts', `${alias}layers/other/y`, [])).toBe('base');
    }
    expect(targetOwner('layers/example/app/x.ts', './y', [])).toBe('example');
    expect(targetOwner('layers/example/x.ts', '../other/y', [])).toBe('other');
    expect(targetOwner('app/x.ts', '#layers/example/y', [])).toBe('example');
    expect(targetOwner('app/x.ts', 'unclaimed-package/subpath', [])).toBe('base');
  });

  it('only imports base or its declared requires closure', async () => {
    const files = await Promise.all(
      codeFiles.map(async (path) => ({
        path,
        imports: importOwners(path, await readFile(join(kitRoot, path), 'utf8')),
      })),
    );
    // Check unknown targets first, so even a newly added, malformed module.json
    // cannot hide an illegal import behind its metadata validation error.
    const unknownLayers = files.flatMap(({ path, imports }) =>
      imports
        .filter(
          ({ specifier }) =>
            specifier.startsWith('#layers/') && !layerIds.has(specifier.split('/')[1] ?? ''),
        )
        .map(({ specifier }) => `${path}:${specifier} (unknown layer)`),
    );
    expect(unknownLayers, unknownLayers.join('\n')).toEqual([]);

    const modules = await boundaryModules();
    const allowed = new Map(
      modules.map((module) => [
        module.id,
        new Set(
          module.id === 'base' ? ['base'] : ['base', ...resolveSelection(modules, [module.id])],
        ),
      ]),
    );
    const violations = files
      .flatMap(({ path, imports }) =>
        imports.flatMap(({ specifier, owner }) => {
          const target = targetOwner(path, specifier, modules);
          return target === 'base' || allowed.get(owner)?.has(target)
            ? []
            : [`${path}:${specifier} (${owner} -> ${target})`];
        }),
      )
      .sort();
    const unexpected = violations.filter((violation) => !knownViolations.includes(violation));
    expect(unexpected, unexpected.join('\n')).toEqual([]);
    // Stale exceptions fail so the migration must shrink this list.
    expect(knownViolations.filter((violation) => !violations.includes(violation))).toEqual([]);
    expect(files.length).toBeGreaterThan(100);
  });

  it('does not leave nsk markers anywhere under layers/', async () => {
    const violations: string[] = [];
    for (const path of kitFiles.filter((file) => file.startsWith('layers/'))) {
      const source = await readFile(join(kitRoot, path), 'utf8');
      if (source.includes('nsk:')) violations.push(`${path}:nsk:`);
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
