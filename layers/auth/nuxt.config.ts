import { createResolver } from '@nuxt/kit';
import type { NuxtConfig } from 'nuxt/schema';
import { defaultLocale, locales } from '../../i18n-constants';

const { resolve } = createResolver(import.meta.url);

const dashboardAuthRule = { appMiddleware: ['auth'] } satisfies NonNullable<
  NuxtConfig['routeRules']
>[string];

const dashboardRouteRules = Object.fromEntries(
  ['', ...locales.filter((locale) => locale !== defaultLocale).map((locale) => `/${locale}`)]
    .flatMap((prefix) => [`${prefix}/dashboard`, `${prefix}/dashboard/**`])
    .map((path) => [path, dashboardAuthRule]),
);

const privateAccountPageRule = {
  ssr: false,
  prerender: false,
  robots: false,
  headers: { 'Cache-Control': 'private, no-store' },
} satisfies NonNullable<NuxtConfig['routeRules']>[string];

export default defineNuxtConfig({
  modules: ['nuxt-auth-utils'],

  i18n: {
    locales: [
      { code: 'en', file: 'en.json' },
      { code: 'vi', file: 'vi.json' },
    ],
  },

  runtimeConfig: {
    session: {
      // Persist the session across browser and PWA restarts.
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  },

  routeRules: {
    ...dashboardRouteRules,
    '/settings': privateAccountPageRule,
    '/settings/**': privateAccountPageRule,
    '/onboarding': privateAccountPageRule,
  },

  nitro: {
    prerender: {
      // Sign-in pages are rendered per request on the Worker.
      ignore: ['/auth/**', '/settings', '/settings/**', '/onboarding'],
    },
    typescript: {
      tsConfig: {
        // Nitro's generated tsconfig includes server/ and shared/*.d.ts only, so
        // the #auth-utils augmentation in auth.d.ts never reaches server code and
        // every session.user access fails to resolve.
        include: [resolve('./auth.d.ts')],
      },
    },
  },
});
