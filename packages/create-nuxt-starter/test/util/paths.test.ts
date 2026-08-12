import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError } from '../../src/errors';
import { assertRelativePath, resolveInside, toPosixPath } from '../../src/util/paths';

describe('toPosixPath', () => {
  it('normalises separators to forward slashes', () => {
    expect(toPosixPath('app/components/Button.vue')).toBe('app/components/Button.vue');
  });
});

describe('assertRelativePath', () => {
  it.each([
    ['', 'empty'],
    ['/etc/passwd', 'absolute'],
    ['../secrets', 'parent traversal'],
    ['app/../../secrets', 'embedded traversal'],
    ['app\\..\\..\\secrets', 'windows-style traversal'],
  ])('rejects %s (%s)', (value) => {
    expect(() => assertRelativePath(value, 'Module path')).toThrow(CliError);
  });

  it('accepts a nested relative path', () => {
    expect(() => assertRelativePath('app/components/Button.vue', 'Module path')).not.toThrow();
  });
});

describe('resolveInside', () => {
  it('resolves a relative path against the root', () => {
    expect(resolveInside('/tmp/project', 'app/app.vue', 'Generated file')).toBe(
      resolve('/tmp/project/app/app.vue'),
    );
  });

  it('refuses to escape the root', () => {
    expect(() => resolveInside('/tmp/project', '../outside', 'Generated file')).toThrow(CliError);
  });
});
