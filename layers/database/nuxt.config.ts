export default defineNuxtConfig({
  modules: ['@nuxthub/core'],
  hub: {
    // D1 database (binding defaults to 'DB')
    db: 'sqlite',
  },
});
