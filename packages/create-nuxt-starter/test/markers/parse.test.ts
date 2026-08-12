import { describe, expect, it } from 'vitest';
import { parseMarkers } from '../../src/markers/parse';

describe('parseMarkers', () => {
  it('finds a block regardless of comment syntax', () => {
    const contents = [
      'export default {',
      '  // <nsk:content>',
      '  content: {},',
      '  // </nsk:content>',
      '}',
    ].join('\n');
    expect(parseMarkers(contents, 'nuxt.config.ts')).toEqual([
      { moduleId: 'content', startLine: 1, endLine: 3 },
    ]);
  });

  it.each([
    ['html', '<!-- <nsk:pwa> -->\n<meta />\n<!-- </nsk:pwa> -->'],
    ['css', '/* <nsk:pwa> */\n.a {}\n/* </nsk:pwa> */'],
  ])('handles %s comment style', (_style, contents) => {
    expect(parseMarkers(contents, 'file')).toEqual([{ moduleId: 'pwa', startLine: 0, endLine: 2 }]);
  });

  it('finds multiple sibling blocks', () => {
    const contents = [
      '// <nsk:auth>',
      'a',
      '// </nsk:auth>',
      '// <nsk:pwa>',
      'p',
      '// </nsk:pwa>',
    ].join('\n');
    expect(parseMarkers(contents, 'file')).toEqual([
      { moduleId: 'auth', startLine: 0, endLine: 2 },
      { moduleId: 'pwa', startLine: 3, endLine: 5 },
    ]);
  });

  it('returns an empty list when there are no markers', () => {
    expect(parseMarkers('const a = 1\n', 'file')).toEqual([]);
  });

  it.each([
    ['unclosed block', '// <nsk:auth>\nconst a = 1\n', /never closed/],
    ['close without open', 'const a = 1\n// </nsk:auth>\n', /closes .* never opened/],
    ['mismatched close', '// <nsk:auth>\na\n// </nsk:pwa>\n', /closes "pwa".*"auth" is open/],
    [
      'nested block',
      '// <nsk:auth>\n// <nsk:pwa>\np\n// </nsk:pwa>\n// </nsk:auth>\n',
      /cannot be nested/,
    ],
  ])('rejects %s', (_name, contents, pattern) => {
    expect(() => parseMarkers(contents, 'nuxt.config.ts')).toThrow(pattern);
  });

  it('reports the file and line number in errors', () => {
    expect(() => parseMarkers('a\n// <nsk:auth>\n', 'nuxt.config.ts')).toThrow(
      /nuxt\.config\.ts:2/,
    );
  });
});
