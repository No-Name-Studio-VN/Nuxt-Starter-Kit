import { createResolver } from '@nuxt/kit';

const { resolve } = createResolver(import.meta.url);

export default defineNuxtConfig({
  modules: ['nuxt-auth-utils', '@nuxtjs/turnstile'],

  runtimeConfig: {
    turnstile: {
      secretKey: '',
    },
    // Transactional email, read by server/utils/email.ts.
    resend: {
      apiKey: '',
      fromEmail: '',
    },
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
        // every session.user access fails to resolve. auth.d.ts stays at the kit
        // root until the 2FA module takes its pending-login field out of it.
        include: [resolve('../../auth.d.ts')],
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
