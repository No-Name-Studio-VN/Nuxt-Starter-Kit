import { createResolver } from '@nuxt/kit';

const { resolve } = createResolver(import.meta.url);

export default defineNuxtConfig({
  modules: ['nuxt-auth-utils', '@nuxtjs/turnstile'],

  i18n: {
    locales: [
      { code: 'en', file: 'en.json' },
      { code: 'vi', file: 'vi.json' },
    ],
  },

  runtimeConfig: {
    turnstile: {
      secretKey: '',
    },
    // Transactional email, read by server/utils/email.ts.
    resend: {
      apiKey: '',
      fromEmail: '',
    },
    oauth: {
      google: { clientId: '', clientSecret: '' },
      github: { clientId: '', clientSecret: '' },
      discord: { clientId: '', clientSecret: '' },
    },
    session: {
      // Persist the cookie across browser/PWA restarts. Nuxt counts from the
      // last session write; reading a session does not extend its lifetime.
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  },

  routeRules: {
    '/settings/**': {
      ssr: false,
      prerender: false,
    },
  },

  nitro: {
    prerender: {
      // Sign-in and account pages are rendered per request on the Worker.
      ignore: ['/settings', '/settings/**', '/auth/**'],
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

  security: {
    headers: {
      // OAuth and Google One Tap sign in through popups that report back to this window.
      crossOriginOpenerPolicy: 'same-origin-allow-popups',
      contentSecurityPolicy: {
        // Turnstile's challenge widget.
        'style-src': ['https://challenges.cloudflare.com'],
      },
    },
  },

  turnstile: {
    siteKey: process.env.NUXT_TURNSTILE_SITE_KEY,
  },

  sitemap: {
    exclude: ['/settings/**'],
  },
});
