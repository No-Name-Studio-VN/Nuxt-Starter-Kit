import { loadNuxtConfig } from '@nuxt/kit';
import { beforeAll, describe, expect, it } from 'vitest';

let config: Awaited<ReturnType<typeof loadNuxtConfig>>;

beforeAll(async () => {
  config = await loadNuxtConfig({ cwd: process.cwd() });
});

function shouldIgnore(path: string): boolean {
  return (config.nitro.prerender?.ignore ?? []).some((pattern) => {
    if (typeof pattern === 'string') return path.startsWith(pattern);
    if (typeof pattern === 'function') return pattern(path) === true;
    return pattern.test(path);
  });
}

describe('effective Nitro prerender settings', () => {
  it('seeds the localized home and fallback files without making a failed page fatal', () => {
    expect(config.nitro.prerender?.routes).toEqual(
      expect.arrayContaining(['/', '/vi', '/404.html', '/robots.txt']),
    );
    expect(config.nitro.prerender?.failOnError).toBe(false);
  });

  it.each([
    '/api',
    '/api/example',
    '/auth/login',
    '/vi/auth/login',
    '/settings/profile',
    '/onboarding',
    '/admin/users',
    '/_studio/editor',
    '/__nuxt_studio/api',
    '/admin/studio',
    '/pwa',
    '/__og-image__/static/pwa',
  ])('ignores %s', (path) => {
    expect(shouldIgnore(path)).toBe(true);
  });

  it.each([
    '/api-reference',
    '/auth-guide',
    '/settings-help',
    '/administrator',
    '/pwa-guide',
    '/vi',
    '/404.html',
  ])('does not ignore %s', (path) => {
    expect(shouldIgnore(path)).toBe(false);
  });
});
