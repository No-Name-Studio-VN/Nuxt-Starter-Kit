export default defineNuxtConfig({
  modules: ['@nuxthub/core'],
  hub: {
    // Cache KV namespace (binding defaults to 'CACHE')
    cache: true,
  },
});
