export default defineNuxtConfig({
  modules: ['@nuxthub/core'],
  hub: {
    // KV namespace (binding defaults to 'KV')
    kv: true,
  },
});
