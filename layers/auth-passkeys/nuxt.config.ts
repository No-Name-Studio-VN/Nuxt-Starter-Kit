export default defineNuxtConfig({
  i18n: {
    locales: [
      { code: 'en', file: 'en.json' },
      { code: 'vi', file: 'vi.json' },
    ],
  },
  auth: {
    webAuthn: true,
  },
  nitro: {
    // Nitro otherwise tree-shakes side-effect-only imports from dependencies.
    moduleSideEffects: ['reflect-metadata/'],
  },
  // nuxt-security's strict default blocks WebAuthn (publickey-credentials-get=()).
  security: {
    headers: {
      permissionsPolicy: {
        'publickey-credentials-get': ['self'],
        'publickey-credentials-create': ['self'],
      },
    },
  },
});
