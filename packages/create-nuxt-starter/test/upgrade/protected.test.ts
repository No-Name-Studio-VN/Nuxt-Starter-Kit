import { describe, expect, it } from 'vitest';
import { isProtectedPath } from '../../src/upgrade/protected';

describe('isProtectedPath', () => {
  it.each([
    '.env',
    '.env.local',
    'content/index.md',
    'content/blog/post.md',
    'server/db/migrations/0001_init.sql',
    'package-lock.json',
    'pnpm-lock.yaml',
    '.nuxt-starter/manifest.json',
  ])('protects %s', (path) => {
    expect(isProtectedPath(path)).toBe(true);
  });

  it.each([
    'nuxt.config.ts',
    'app/app.vue',
    'content.config.ts',
    'server/db/schema.ts',
    'package.json',
  ])('does not protect %s', (path) => {
    expect(isProtectedPath(path)).toBe(false);
  });

  // Templates, not secrets: protecting them would stop a module ever telling an
  // existing project about a variable it started needing.
  it.each(['.env.example', '.env.sample', '.env.template'])(
    'does not protect the %s template',
    (path) => {
      expect(isProtectedPath(path)).toBe(false);
    },
  );
});
