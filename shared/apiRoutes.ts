const ADMIN_API_PREFIX = '/api/admin';

export const apiRoutes = {
  API_PREFIX: '/api/',
  ADMIN_API_PREFIX: ADMIN_API_PREFIX,

  // <nsk:feature-flags>
  ADMIN_FEATURE_FLAGS: ADMIN_API_PREFIX + '/feature-flags',
  // </nsk:feature-flags>
  ADMIN_KV: ADMIN_API_PREFIX + '/kv',
  ADMIN_KV_VALUES: ADMIN_API_PREFIX + '/kv/values',
  ADMIN_KV_ITEMS: ADMIN_API_PREFIX + '/kv/items',
  ADMIN_KV_DELETE: ADMIN_API_PREFIX + '/kv/delete',
  ADMIN_KV_CLEAR: ADMIN_API_PREFIX + '/kv/clear',
  // <nsk:feature-flags>
  FLAGS_EVALUATE: '/api/flags',
  // </nsk:feature-flags>

  // <nsk:auth-email-verification>
  AUTH_VERIFY_EMAIL: '/auth/verify-email',
  // </nsk:auth-email-verification>
  // <nsk:auth-passkeys>
  MY_PASSKEYS: '/api/users/me/passkeys',
  // </nsk:auth-passkeys>

  // 2FA Routes
  // <nsk:auth-2fa>
  MY_2FA_SETUP: '/api/users/me/2fa/setup',
  MY_2FA_VERIFY: '/api/users/me/2fa/verify',
  MY_2FA_SETTINGS: '/api/users/me/2fa/settings',
  MY_2FA_DISABLE: '/api/users/me/2fa/disable',
  // </nsk:auth-2fa>

  ADMIN_DASHBOARD: ADMIN_API_PREFIX + '/dashboard',
  ADMIN_USERS: ADMIN_API_PREFIX + '/users',
  ADMIN_USERS_DELETE: ADMIN_API_PREFIX + '/users/delete',

  // <nsk:auth-2fa>
  AUTH_LOGIN_2FA: '/api/auth/login-2fa',
  // </nsk:auth-2fa>
  // <nsk:auth-email-verification>
  AUTH_RESEND_VERIFICATION: '/api/auth/resend-verification',
  // </nsk:auth-email-verification>

  ADMIN_TASKS_SEED_ADMIN: ADMIN_API_PREFIX + '/tasks/seed-admin',

  // <nsk:feature-flags>
  adminFeatureFlag: (key: string) => ADMIN_API_PREFIX + `/feature-flags/${key}`,
  adminFeatureFlagsExport: () => ADMIN_API_PREFIX + '/feature-flags/export',
  adminFeatureFlagsImport: () => ADMIN_API_PREFIX + '/feature-flags/import',
  adminFeatureFlagsSeedDefaults: () => ADMIN_API_PREFIX + '/feature-flags/seed-defaults',
  // </nsk:feature-flags>

  adminUser: (userId: string | number) => ADMIN_API_PREFIX + `/users/${userId}`,
  adminUserLock: (userId: string | number) => ADMIN_API_PREFIX + `/users/${userId}/lock`,
};

// the route rules of the most outer apis should be defined first
export const routeRules = {
  '/api/admin/seed': {
    security: {
      rateLimiter: {
        tokensPerInterval: 5,
        interval: 3 * 60 * 60 * 24 * 1000, // 3 days
        headers: true,
        throwError: true,
      },
    },
  },
  '/admin/**': {
    ssr: false,
    prerender: false,
  },
  // The front page ships as a static shell: only the chrome and the loading
  // skeleton are baked at build time, and every data source (stories,
  // reading history, session) resolves in the browser. Matches the exact
  // path only — `/**` would swallow every route.
  // Nitro does not crawl links out of a prerendered route unless
  // `nitro.prerender.crawlLinks` is on, so this stays a one-route rule.
  '/': {
    ssr: true,
    prerender: true,
  },
  '/pwa': {
    ssr: true,
    prerender: true,
  },
  '/_studio/**': {
    ssr: true,
  },
  '/__nuxt_studio/**': {
    ssr: true,
  },
  '/admin/studio/login': {
    ssr: true,
    index: false, // Prevent index.html generation
  },
  '/admin/studio/login/**': {
    ssr: true,
    index: false,
  },
  // Directory-level redirects are auto-generated from .navigation.yml files
  // by the ~/modules/navigation-redirects module at build time
};
