import { defineNuxtModule, extendRouteRules, installModule } from '@nuxt/kit';
import { mergeWith } from 'es-toolkit';
import type { ModuleOptions } from 'nuxt-security';

export default defineNuxtModule({
  meta: { name: 'kit-web-security' },
  async setup(_options, nuxt) {
    const defaults: Partial<ModuleOptions> = {
      strict: true,
      rateLimiter: false,
      // Avoid per-page nonce and hash headers exceeding Cloudflare's static header limits.
      nonce: false,
      ssg: false,
      sri: false,
      headers: {
        crossOriginOpenerPolicy: 'same-origin-allow-popups',
        crossOriginEmbedderPolicy: 'unsafe-none',
        contentSecurityPolicy: {
          'script-src': ["'self'", 'https:', "'unsafe-inline'", "'wasm-unsafe-eval'"],
          'style-src': ["'self'", 'https:', "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'https:'],
          'media-src': ["'self'", 'blob:', 'https:'],
          'connect-src': ["'self'", 'https:'],
          'font-src': ["'self'", 'https://*.gstatic.com'],
          'worker-src': ["'self'", 'blob:'],
          'frame-src': ["'self'", 'https:'],
        },
        permissionsPolicy: {
          fullscreen: ['self'],
          'picture-in-picture': ['self'],
          'web-share': ['self'],
          autoplay: ['self'],
          // The strict policy otherwise blocks WebAuthn.
          ...(nuxt.options.alias['#layers/auth-passkeys'] && {
            'publickey-credentials-get': ['self'],
            'publickey-credentials-create': ['self'],
          }),
        },
      },
    };
    // A project may narrow an allowlist. Nuxt's layer merge would append the kit's sources.
    nuxt.options.security = mergeWith(
      defaults,
      nuxt.options.security ?? {},
      (_previous: unknown, value: unknown) => (Array.isArray(value) ? value : undefined),
    );
    if (nuxt.options.alias['#layers/server-core']) {
      extendRouteRules('/api/**', {
        security: {
          rateLimiter: {
            tokensPerInterval: 150,
            interval: 60_000,
            headers: true,
            throwError: true,
          },
        },
      });
    }
    if (nuxt.options.alias['#layers/admin']) {
      extendRouteRules('/api/admin/seed', {
        security: {
          rateLimiter: {
            tokensPerInterval: 5,
            interval: 3 * 24 * 60 * 60_000,
            headers: true,
            throwError: true,
          },
        },
      });
    }
    await installModule('nuxt-security');
  },
});
