import type { NuxtSecurityRouteRules } from 'nuxt-security';

const apiRules: NuxtSecurityRouteRules = {
  rateLimiter: {
    tokensPerInterval: 150,
    interval: 60000, // 60 seconds
    headers: true,
    throwError: true,
  },
};

export default defineNuxtConfig({
  modules: ['@nuxthub/core'],

  // More specific API rules (declared by other modules) merge on top of this one.
  routeRules: {
    '/api/**': {
      security: apiRules,
    },
  },

  hub: {
    // KV namespace (binding defaults to 'KV')
    kv: true,
    // Cache KV namespace (binding defaults to 'CACHE')
    cache: true,
    // R2 bucket (binding defaults to 'BLOB')
    blob: false,
  },
});
