export default defineNuxtConfig({
  i18n: {
    locales: [
      { code: 'en', file: 'en.json' },
      { code: 'vi', file: 'vi.json' },
    ],
  },

  runtimeConfig: {
    // Shared secret guarding the database seed endpoint.
    seed: {
      secret: '',
    },
  },

  routeRules: {
    '/admin/**': {
      ssr: false,
      prerender: false,
      robots: false,
    },
  },

  nitro: {
    experimental: {
      // The `db:seed` task (`pnpm db:seed`).
      tasks: true,
    },
  },

  prerender: {
    // The admin area renders in the browser, for signed-in admins only.
    ignore: [/^\/admin(?:\/|\?|$)/],
  },

  sitemap: {
    exclude: ['/admin/**'],
  },
});
