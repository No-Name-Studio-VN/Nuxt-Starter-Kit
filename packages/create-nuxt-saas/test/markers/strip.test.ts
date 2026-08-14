import { describe, expect, it } from 'vitest';
import { stripUnselectedBlocks } from '../../src/markers/strip';

const config = [
  'export default defineNuxtConfig({',
  '  modules: [',
  '    // <nsk:content>',
  "    '@nuxt/content',",
  '    // </nsk:content>',
  '    // <nsk:pwa>',
  "    '@vite-pwa/nuxt',",
  '    // </nsk:pwa>',
  '  ],',
  '})',
  '',
].join('\n');

describe('stripUnselectedBlocks', () => {
  it('removes unselected blocks entirely, markers included', () => {
    const result = stripUnselectedBlocks(config, new Set(['content']), 'nuxt.config.ts');
    expect(result).toBe(
      [
        'export default defineNuxtConfig({',
        '  modules: [',
        '    // <nsk:content>',
        "    '@nuxt/content',",
        '    // </nsk:content>',
        '  ],',
        '})',
        '',
      ].join('\n'),
    );
  });

  it('keeps selected blocks byte-identical, markers retained', () => {
    expect(stripUnselectedBlocks(config, new Set(['content', 'pwa']), 'nuxt.config.ts')).toBe(
      config,
    );
  });

  it('removes every block when nothing is selected', () => {
    expect(stripUnselectedBlocks(config, new Set(), 'nuxt.config.ts')).toBe(
      ['export default defineNuxtConfig({', '  modules: [', '  ],', '})', ''].join('\n'),
    );
  });

  it('leaves marker-free content untouched', () => {
    const plain = 'const a = 1\nconst b = 2\n';
    expect(stripUnselectedBlocks(plain, new Set(['base']), 'file.ts')).toBe(plain);
  });

  it('preserves trailing newline handling', () => {
    const contents = '// <nsk:pwa>\nx\n// </nsk:pwa>\nkeep\n';
    expect(stripUnselectedBlocks(contents, new Set(), 'file.ts')).toBe('keep\n');
  });
});
