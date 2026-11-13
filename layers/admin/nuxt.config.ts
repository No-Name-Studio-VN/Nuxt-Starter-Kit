import type { NuxtSecurityRouteRules } from 'nuxt-security';

const seedRules: NuxtSecurityRouteRules = {
  rateLimiter: {
    tokensPerInterval: 5,
    interval: 3 * 60 * 60 * 24 * 1000, // 3 days
    headers: true,
    throwError: true,
  },
};

export default defineNuxtConfig({
  runtimeConfig: {
    // Shared secret guarding the database seed endpoint.
    seed: {
      secret: '',
    },
    defaultAdminPassword: '',
  },

  routeRules: {
    '/api/admin/seed': {
      security: seedRules,
    },
    '/admin/**': {
      ssr: false,
      prerender: false,
    },
  },

  nitro: {
    experimental: {
      // The `db:admin-creation` seed task (`pnpm db:seed`).
      tasks: true,
    },
    prerender: {
      // The admin area renders in the browser, for signed-in admins only.
      ignore: ['/admin', '/admin/**'],
    },
  },

  sitemap: {
    exclude: ['/admin/**'],
  },
});
