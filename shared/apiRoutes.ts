export const apiRoutes = {
  API_PREFIX: '/api/',

  // <nsk:auth-email-verification>
  AUTH_VERIFY_EMAIL: '/auth/verify-email',
  // </nsk:auth-email-verification>

  // <nsk:auth-email-verification>
  AUTH_RESEND_VERIFICATION: '/api/auth/resend-verification',
  // </nsk:auth-email-verification>
};

// the route rules of the most outer apis should be defined first
export const routeRules = {
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
