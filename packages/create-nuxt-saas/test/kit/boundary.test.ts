import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSelection, type KitModule } from '../../src/kit/modules';
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

// The only exceptions were for the R2 holding schema, deleted once every table
// moved into its owner's layer. Never add one: fix the import instead.
const knownViolations: string[] = [];

const codeFiles = kitFiles.filter((path) => /\.(?:ts|vue|js|mjs)$/.test(path));

interface SourceImports {
  path: string;
  imports: ReturnType<typeof importOwners>;
}

/** Every import whose target lies outside its owner's requires closure, sorted. */
function boundaryViolations(files: SourceImports[], modules: KitModule[]): string[] {
  const allowed = new Map(
    modules.map((module) => [
      module.id,
      new Set(
        module.id === 'base' ? ['base'] : ['base', ...resolveSelection(modules, [module.id])],
      ),
    ]),
  );
  return files
    .flatMap(({ path, imports }) =>
      imports.flatMap(({ specifier, owner }) => {
        const target = targetOwner(path, specifier, modules);
        return target === 'base' || allowed.get(owner)?.has(target)
          ? []
          : [`${path}:${specifier} (${owner} -> ${target})`];
      }),
    )
    .sort();
}

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

  it('keeps the registry owner of a root file its module left behind', () => {
    // R14 transitional ownership; removed in Task 15 with the registry fallback.
    // AppSidebar moved in Task 13; this plugin retains its registry owner (R10/R14).
    expect(ownerOf('server/plugins/sentry-cloudflare-plugin.ts')).toBe('server-core');
    expect(ownerOf('app/app.vue')).toBe('base');
  });

  it('resolves global aliases against the kit root and relative imports against the file', () => {
    for (const alias of ['~/', '@/', '#shared/']) {
      expect(targetOwner('layers/example/x.ts', `${alias}layers/other/y`, [])).toBe('base');
    }
    for (const alias of ['~~/', '@@/']) {
      expect(targetOwner('layers/example/x.ts', `${alias}layers/other/y`, [])).toBe('other');
    }
    expect(targetOwner('layers/example/app/x.ts', './y', [])).toBe('example');
    expect(targetOwner('layers/example/x.ts', '../other/y', [])).toBe('other');
    expect(targetOwner('app/x.ts', '#layers/example/y', [])).toBe('example');
    expect(targetOwner('app/x.ts', 'unclaimed-package/subpath', [])).toBe('base');
  });

  it('reports a base file reaching another module through a root alias', async () => {
    const modules = await boundaryModules();
    const source = [
      "import type { ApiResponse } from '~~/layers/server-core/types/api';",
      // Root aliases can reach layer files too; no unpeeled modules remain.
      "import type { LandingHero } from '~~/layers/content/types/landing';",
    ].join('\n');
    expect(
      boundaryViolations(
        [{ path: 'app/app.vue', imports: importOwners('app/app.vue', source) }],
        modules,
      ),
    ).toEqual([
      'app/app.vue:~~/layers/content/types/landing (base -> content)',
      'app/app.vue:~~/layers/server-core/types/api (base -> server-core)',
    ]);
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

    const violations = boundaryViolations(files, await boundaryModules());
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
