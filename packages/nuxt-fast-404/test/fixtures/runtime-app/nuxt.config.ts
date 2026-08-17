import fast404 from 'nuxt-fast-404';

export default defineNuxtConfig({
  modules: [fast404],
  fast404: {
    exclude: ['/runtime-routes/**'],
  },
  nitro: {
    preset: 'node-server',
  },
});
