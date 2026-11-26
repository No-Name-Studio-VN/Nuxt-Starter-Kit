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
});
