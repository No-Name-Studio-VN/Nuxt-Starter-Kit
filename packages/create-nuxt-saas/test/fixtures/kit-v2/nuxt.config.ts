export default defineNuxtConfig({
  compatibilityDate: '2026-01-01',
  modules: [
    // <nsk:content>
    '@nuxt/content',
    '@nuxtjs/mdc',
    // </nsk:content>
    // <nsk:pwa>
    '@vite-pwa/nuxt',
    // </nsk:pwa>
  ],
});
