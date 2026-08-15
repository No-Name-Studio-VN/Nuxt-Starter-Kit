import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROJECT_NAME,
  sanitizeProjectName,
  validateProjectName,
} from '../../src/util/projectName';

describe('validateProjectName', () => {
  it.each(['my-app', 'my-nuxt-app', 'app123', 'a', 'my.app', 'my_app', DEFAULT_PROJECT_NAME])(
    'accepts %s',
    (name) => {
      expect(validateProjectName(name)).toBeNull();
    },
  );

  it.each([
    ['', 'empty'],
    ['   ', 'blank'],
    ['My-App', 'uppercase'],
    ['my app', 'space'],
    ['.hidden', 'leading dot'],
    ['_private', 'leading underscore'],
    ['foo/bar', 'path separator'],
    ['foo\\bar', 'windows path separator'],
    ['.', 'current directory'],
    ['..', 'parent directory'],
    ['@scope/app', 'scoped name'],
    ['app!', 'punctuation'],
    ['con', 'windows reserved device'],
    ['lpt1', 'windows reserved port'],
    ['node_modules', 'npm blocklist'],
    ['favicon.ico', 'npm blocklist'],
    ['app ', 'trailing space'],
    ['app.', 'trailing dot'],
  ])('rejects %s (%s)', (name) => {
    expect(validateProjectName(name)).toBeTypeOf('string');
  });

  it('rejects a name longer than npm allows', () => {
    expect(validateProjectName('a'.repeat(215))).toBeTypeOf('string');
    expect(validateProjectName('a'.repeat(214))).toBeNull();
  });

  it('explains the problem rather than restating the rule', () => {
    expect(validateProjectName('My-App')).toMatch(/lowercase/i);
    expect(validateProjectName('foo/bar')).toMatch(/single folder|slash|separator/i);
  });
});

describe('sanitizeProjectName', () => {
  it.each([
    ['MyApp', 'myapp'],
    ['My Project', 'my-project'],
    ['apps/Web', 'apps-web'],
    ['  spaced  ', 'spaced'],
    ['--leading-dashes', 'leading-dashes'],
    ['weird!!chars@@here', 'weird-chars-here'],
    ['.hidden', 'hidden'],
    ['node_modules', 'node_modules-app'],
    ['con', 'con-app'],
  ])('turns %s into %s', (input, expected) => {
    expect(sanitizeProjectName(input)).toBe(expected);
  });

  it('falls back to the default when nothing usable survives', () => {
    expect(sanitizeProjectName('!!!')).toBe(DEFAULT_PROJECT_NAME);
    expect(sanitizeProjectName('')).toBe(DEFAULT_PROJECT_NAME);
    expect(sanitizeProjectName('..')).toBe(DEFAULT_PROJECT_NAME);
  });

  it('truncates to the npm length limit', () => {
    expect(sanitizeProjectName('a'.repeat(300))).toHaveLength(214);
  });

  /**
   * The point of sanitizing is that a directory argument can never dead-end the
   * run, so whatever it produces has to satisfy the strict check.
   */
  it.each([
    'MyApp',
    'My Project',
    'apps/Web',
    '!!!',
    '..',
    '.hidden',
    'con',
    'a'.repeat(300),
    '--leading-dashes',
  ])('always produces a name that validates (%s)', (input) => {
    expect(validateProjectName(sanitizeProjectName(input))).toBeNull();
  });
});
