import { describe, expect, it } from 'vitest';
import { extractImports, isCodeFile, resolveKitImport, toPackageName } from './imports';

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
