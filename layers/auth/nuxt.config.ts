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
      password: '',
      // Without maxAge the session cookie is written with no Expires, so it only
      // lives as long as the browsing session. Desktop browsers keep (and restore)
      // that, but mobile browsers and the standalone PWA drop it every time the OS
      // kills the process, logging mobile users out constantly.
      // Counted from login, not from last activity: h3 never refreshes createdAt,
      // so this is an absolute lifetime rather than a sliding window.
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  },

  routeRules: dashboardRouteRules,

  nitro: {
    prerender: {
      // Sign-in pages are rendered per request on the Worker.
      ignore: ['/auth/**'],
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
