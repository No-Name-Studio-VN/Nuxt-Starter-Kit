export default defineNuxtConfig({
  modules: ['@nuxtjs/turnstile'],

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
  },

  security: {
    headers: {
      contentSecurityPolicy: {
        // Turnstile's challenge widget.
        'style-src': ['https://challenges.cloudflare.com'],
      },
    },
  },

  turnstile: {
    siteKey: process.env.NUXT_TURNSTILE_SITE_KEY,
  },
});
