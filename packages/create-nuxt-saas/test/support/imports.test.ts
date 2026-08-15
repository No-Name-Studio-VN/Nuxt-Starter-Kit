import { describe, expect, it } from 'vitest';
import {
  extractImports,
  extractNamedBindings,
  isCodeFile,
  resolveKitImport,
  toPackageName,
} from './imports';

const specifiersOf = (source: string): string[] =>
  extractImports(source).map((entry) => entry.specifier);

describe('extractImports', () => {
  it('finds every form an import can take', () => {
    const source = [
      "import { a } from '~/utils/a';",
      "import type { B } from '~~/types/b';",
      "export { c } from './c';",
      "export * from '#shared/d';",
      "import 'vue';",
      "const e = await import('@/components/E.vue');",
    ].join('\n');

    expect(specifiersOf(source).sort()).toEqual([
      '#shared/d',
      './c',
      '@/components/E.vue',
      'vue',
      '~/utils/a',
      '~~/types/b',
    ]);
  });

  it('reads imports out of a vue single-file component', () => {
    const source = [
      '<template><div /></template>',
      '<script setup lang="ts">',
      "import { cn } from '@/lib/utils';",
      '</script>',
    ].join('\n');
    expect(specifiersOf(source)).toEqual(['@/lib/utils']);
  });

  it('reports the line each import sits on', () => {
    const source = [
      "import { a } from './a';",
      '// <nsk:pwa>',
      "import b from './b';",
      '// </nsk:pwa>',
      '',
      "const c = await import('./c');",
    ].join('\n');

    expect(extractImports(source)).toEqual([
      { specifier: './a', line: 0 },
      { specifier: './b', line: 2 },
      { specifier: './c', line: 5 },
    ]);
  });

  it('keeps both occurrences when a specifier is imported twice', () => {
    const source = "import { a } from './x';\nimport type { B } from './x';";
    expect(extractImports(source)).toEqual([
      { specifier: './x', line: 0 },
      { specifier: './x', line: 1 },
    ]);
  });

  it('locates an import whose specifier is on a continuation line', () => {
    const source = ['import {', '  a,', '  b,', "} from './x';"].join('\n');
    expect(extractImports(source)).toEqual([{ specifier: './x', line: 3 }]);
  });
});

describe('isCodeFile', () => {
  it.each(['app/app.vue', 'shared/db.ts', 'server/api/index.get.ts', 'nuxt.config.ts'])(
    'accepts %s',
    (path) => {
      expect(isCodeFile(path)).toBe(true);
    },
  );

  it.each(['package.json', 'README.md', 'app/assets/css/global.css', 'public/favicon.svg'])(
    'skips %s',
    (path) => {
      expect(isCodeFile(path)).toBe(false);
    },
  );
});

describe('extractNamedBindings', () => {
  const namesOf = (source: string): string[] =>
    extractNamedBindings(source).map((entry) => entry.name);

  it.each([
    ["import { A, B } from 'x';", ['A', 'B']],
    ["import type { A } from 'x';", ['A']],
    ["export { A, B } from 'x';", ['A', 'B']],
    ["export type { A } from 'x';", ['A']],
    ["import { type A, B } from 'x';", ['A', 'B']],
  ])('reads %s', (source, expected) => {
    expect(namesOf(source)).toEqual(expected);
  });

  /** The gated name is the one the target exports, not the local alias. */
  it('takes the exported name from an alias', () => {
    expect(namesOf("import { DBPasskey as Passkey } from 'x';")).toEqual(['DBPasskey']);
  });

  it('reads the braces alongside a default import, not the default', () => {
    expect(namesOf("import service, { helper } from 'x';")).toEqual(['helper']);
  });

  it.each([
    ["export * from 'x';", 'a star re-export names nothing'],
    ["import * as ns from 'x';", 'a namespace import binds the whole module'],
    ["import service from 'x';", 'a default import cannot be gated independently'],
    ["import 'x';", 'a side-effect import binds nothing'],
  ])('yields nothing for %s (%s)', (source) => {
    expect(namesOf(source)).toEqual([]);
  });

  it('carries the specifier with each name', () => {
    expect(extractNamedBindings("import { A } from '#shared/db';")).toEqual([
      { name: 'A', specifier: '#shared/db', line: 0 },
    ]);
  });

  /**
   * The reason lines are tracked per binding rather than per statement: a
   * re-export list can gate one entry on its own.
   */
  it('reports the line of each binding in a multi-line clause', () => {
    const source = [
      'export type {',
      '  DBAuthToken,',
      '  DBPasskey,',
      '  User,',
      "} from '~~/types/db/database';",
    ].join('\n');
    expect(extractNamedBindings(source)).toEqual([
      { name: 'DBAuthToken', specifier: '~~/types/db/database', line: 1 },
      { name: 'DBPasskey', specifier: '~~/types/db/database', line: 2 },
      { name: 'User', specifier: '~~/types/db/database', line: 3 },
    ]);
  });

  it('is not fooled by braces that are not an import clause', () => {
    expect(namesOf("const shape = { a: 1 };\nconst from = 'x';")).toEqual([]);
  });
});

describe('toPackageName', () => {
  it.each([
    ['vue', 'vue'],
    ['otpauth', 'otpauth'],
    ['es-toolkit/compat', 'es-toolkit'],
    ['@vueuse/core', '@vueuse/core'],
    ['@codemirror/lang-json', '@codemirror/lang-json'],
    ['@sentry/nuxt/module', '@sentry/nuxt'],
  ])('reduces %s to the installable package %s', (specifier, expected) => {
    expect(toPackageName(specifier)).toBe(expected);
  });

  it.each(['./local', '../up', '~/app', '~~/root', '@/app', '#shared/x', '#imports', 'node:path'])(
    'does not treat %s as a package',
    (specifier) => {
      expect(toPackageName(specifier)).toBeNull();
    },
  );

  /**
   * A virtual module that only exists once its package is installed couples the
   * importer to that package just as surely as naming it would.
   */
  it.each([
    ['#auth-utils', 'nuxt-auth-utils'],
    ['#auth-utils/deep', 'nuxt-auth-utils'],
  ])('attributes %s to the package that provides it', (specifier, expected) => {
    expect(toPackageName(specifier)).toBe(expected);
  });

  it.each(['#app', '#app/composables/fetch', '#build/x'])(
    "leaves Nuxt's own virtual module %s unattributed",
    (specifier) => {
      expect(toPackageName(specifier)).toBeNull();
    },
  );
});

describe('resolveKitImport', () => {
  const kitFiles = new Set([
    'app/lib/utils.ts',
    'app/components/Button.vue',
    'app/composables/index.ts',
    'shared/apiRoutes.ts',
    'shared/schemas/index.ts',
    'types/models/passkey.d.ts',
    'types/api.ts',
    'server/utils/db.ts',
  ]);

  it.each([
    ['app/pages/index.vue', '@/lib/utils', 'app/lib/utils.ts'],
    ['app/pages/index.vue', '~/lib/utils', 'app/lib/utils.ts'],
    ['app/pages/index.vue', '~~/types/api', 'types/api.ts'],
    ['app/pages/index.vue', '@@/types/api', 'types/api.ts'],
    ['app/pages/index.vue', '#shared/apiRoutes', 'shared/apiRoutes.ts'],
    ['app/pages/index.vue', '@/components/Button.vue', 'app/components/Button.vue'],
  ])('resolves %s importing %s', (from, specifier, expected) => {
    expect(resolveKitImport(from, specifier, kitFiles)).toBe(expected);
  });

  it('resolves a relative specifier against the importing file', () => {
    expect(resolveKitImport('server/api/thing.get.ts', '../utils/db', kitFiles)).toBe(
      'server/utils/db.ts',
    );
    expect(resolveKitImport('app/lib/themes.ts', './utils', kitFiles)).toBe('app/lib/utils.ts');
  });

  it('resolves a directory specifier to its index file', () => {
    expect(resolveKitImport('app/pages/index.vue', '~/composables', kitFiles)).toBe(
      'app/composables/index.ts',
    );
    expect(resolveKitImport('shared/schemas/userSchema.ts', '.', kitFiles)).toBe(
      'shared/schemas/index.ts',
    );
  });

  it('resolves a declaration file imported without an extension', () => {
    expect(resolveKitImport('app/app.vue', '~~/types/models/passkey', kitFiles)).toBe(
      'types/models/passkey.d.ts',
    );
  });

  it.each([
    ['vue', 'an npm package'],
    ['@vueuse/core', 'a scoped npm package'],
    ['#app/composables/fetch', "one of Nuxt's virtual modules"],
    ['#imports', 'the auto-import barrel'],
    ['~/does/not/exist', 'a path outside the kit'],
    ['../../../etc/passwd', 'a path escaping the kit'],
  ])('treats %s as external (%s)', (specifier) => {
    expect(resolveKitImport('app/pages/index.vue', specifier, kitFiles)).toBeNull();
  });
});
