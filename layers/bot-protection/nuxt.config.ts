import botProtection from './module';

export default defineNuxtConfig({
  modules: [botProtection],
  i18n: {
    locales: [
      { code: 'en', file: 'en.json' },
      { code: 'vi', file: 'vi.json' },
    ],
  },
});
