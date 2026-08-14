import { describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import { applyPlaceholders, assertKnownPlaceholders } from '../../src/render/placeholders';

describe('applyPlaceholders', () => {
  it('replaces every occurrence of a token', () => {
    const contents = '{"name":"{{PROJECT_NAME}}","bin":"{{PROJECT_NAME}}"}';
    expect(applyPlaceholders(contents, { PROJECT_NAME: 'my-app' })).toBe(
      '{"name":"my-app","bin":"my-app"}',
    );
  });

  it('leaves unrelated content untouched', () => {
    expect(applyPlaceholders('const a = `${b}`\n', { PROJECT_NAME: 'x' })).toBe(
      'const a = `${b}`\n',
    );
  });

  it('does not re-expand substituted values', () => {
    expect(
      applyPlaceholders('{{PROJECT_NAME}}', {
        PROJECT_NAME: '{{AUTHOR_NAME}}',
        AUTHOR_NAME: 'nope',
      }),
    ).toBe('{{AUTHOR_NAME}}');
  });

  it('leaves tokens with no supplied value in place', () => {
    expect(applyPlaceholders('{{AUTHOR_EMAIL}}', { PROJECT_NAME: 'x' })).toBe('{{AUTHOR_EMAIL}}');
  });
});

describe('assertKnownPlaceholders', () => {
  it('accepts known keys', () => {
    expect(() =>
      assertKnownPlaceholders({ PROJECT_NAME: 'x', AUTHOR_EMAIL: 'a@b.c' }),
    ).not.toThrow();
  });

  it('rejects unknown keys', () => {
    expect(() => assertKnownPlaceholders({ NOT_A_KEY: 'x' })).toThrow(CliError);
  });
});
