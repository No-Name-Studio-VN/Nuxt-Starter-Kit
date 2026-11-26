import { cp, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadNuxt } from '@nuxt/kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const kitRoot = process.cwd();
let root: string;
let nuxt: Awaited<ReturnType<typeof loadNuxt>> | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kit-web-security-'));
  await symlink(join(kitRoot, 'node_modules'), join(root, 'node_modules'), 'junction');
  await writeFile(join(root, 'nuxt.config.ts'), 'export default defineNuxtConfig({});\n');
});

afterEach(async () => {
  await nuxt?.close();
  nuxt = undefined;
  await rm(root, { recursive: true, force: true });
});

async function load(
  layers: string[],
  overrides?: NonNullable<Parameters<typeof loadNuxt>[0]>['overrides'],
) {
  for (const layer of layers) {
    await cp(join(kitRoot, 'layers', layer), join(root, 'layers', layer), { recursive: true });
  }
  nuxt = await loadNuxt({
    cwd: root,
    overrides: { devtools: false, telemetry: false, ...overrides },
  });
  return nuxt.options;
}

describe('Web Security Nuxt integration', () => {
  it('enables the strict, Cloudflare-compatible policy when used without server layers', async () => {
    const options = await load(['web-security']);
    expect(options.runtimeConfig.security).toMatchObject({
      enabled: true,
      strict: true,
      nonce: false,
      ssg: false,
      sri: false,
      headers: {
        crossOriginOpenerPolicy: 'same-origin-allow-popups',
        crossOriginEmbedderPolicy: 'unsafe-none',
        contentSecurityPolicy: { 'object-src': ["'none'"] },
      },
    });
  });

  it('keeps WebAuthn permissions and API/seed rate limits when the consuming layers are present', async () => {
    const options = await load([
      'web-security',
      'server-core',
      'admin',
      'auth-oauth',
      'auth-passkeys',
    ]);
    expect(options.runtimeConfig.security).toMatchObject({
      enabled: true,
      rateLimiter: false,
      headers: {
        crossOriginOpenerPolicy: 'same-origin-allow-popups',
        permissionsPolicy: {
          'publickey-credentials-get': ['self'],
          'publickey-credentials-create': ['self'],
        },
      },
    });
    expect(options.nitro.routeRules).toMatchObject({
      '/api/**': {
        security: {
          rateLimiter: {
            tokensPerInterval: 150,
            interval: 60_000,
            headers: true,
            throwError: true,
          },
        },
      },
      '/api/admin/seed': {
        security: {
          rateLimiter: {
            tokensPerInterval: 5,
            interval: 259_200_000,
            headers: true,
            throwError: true,
          },
        },
      },
    });
  });

  it('does not configure Nuxt Security when only the consuming layers are present', async () => {
    const options = await load(['server-core', 'admin', 'auth-oauth', 'auth-passkeys']);
    expect(options.security).toBeUndefined();
    expect(options.runtimeConfig.security).toBeUndefined();
    expect(options.nitro.routeRules?.['/api/**']?.security).toBeUndefined();
    expect(options.nitro.routeRules?.['/api/admin/seed']?.security).toBeUndefined();
  });

  it('preserves project overrides of the kit rate limits', async () => {
    const options = await load(['web-security', 'server-core', 'admin'], {
      routeRules: {
        '/api/**': { security: { rateLimiter: { tokensPerInterval: 75 } } },
        '/api/admin/seed': { security: { rateLimiter: false } },
      },
    });
    expect(options.nitro.routeRules).toMatchObject({
      '/api/**': { security: { rateLimiter: { tokensPerInterval: 75, interval: 60000 } } },
      '/api/admin/seed': { security: { rateLimiter: false } },
    });
  });

  it('retains tighter project directives after moving the default policy into a layer', async () => {
    const options = await load(['web-security'], {
      modules: ['nuxt-security'],
      security: { headers: { contentSecurityPolicy: { 'script-src': ["'self'"] } } },
    });
    expect(options.runtimeConfig.security).toMatchObject({ enabled: true, nonce: false });
    expect(options.runtimeConfig.security).toHaveProperty(
      'headers.contentSecurityPolicy.script-src',
      ["'self'"],
    );
  });
});
