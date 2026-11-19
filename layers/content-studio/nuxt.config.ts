import { createResolver } from '@nuxt/kit';

const { resolve } = createResolver(import.meta.url);

export default defineNuxtConfig({
  modules: ['nuxt-studio', 'nuxt-component-meta'],
  css: [resolve('./app/assets/css/content.css')],
  nitro: {
    prerender: {
      ignore: [
        '/_studio',
        '/_studio/**',
        '/__nuxt_studio',
        '/__nuxt_studio/**',
        '/admin/studio',
        '/admin/studio/**',
      ],
    },
  },
  routeRules: {
    '/_studio/**': { ssr: true },
    '/__nuxt_studio/**': { ssr: true },
    '/admin/studio': { ssr: true, headers: { 'X-Robots-Tag': 'noindex' } },
    '/admin/studio/**': { ssr: true, headers: { 'X-Robots-Tag': 'noindex' } },
  },
  componentMeta: {
    // Exclude problematic paths that cause Windows path resolution issues
    exclude: [/node_modules/, /\.nuxt/, /\.output/, /dist/, /\.component-meta/],
    componentDirs: [{ path: resolve('../content/app/components/content') }],
  },
  studio: {
    route: '/admin/studio',
    repository: {
      provider: 'github',
      owner: 'No-Name-Studio-VN',
      repo: 'Nuxt-Starter-Kit',
      branch: 'main',
    },
  },
});
