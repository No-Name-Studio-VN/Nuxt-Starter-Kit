export default defineNuxtConfig({
  i18n: {
    locales: [
      { code: 'en', file: 'en.json' },
      { code: 'vi', file: 'vi.json' },
    ],
  },
  security: {
    headers: {
      crossOriginOpenerPolicy: 'same-origin-allow-popups',
    },
  },
});
