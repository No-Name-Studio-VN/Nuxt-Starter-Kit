import { createRequire } from 'node:module';
import { createResolver } from '@nuxt/kit';
import { APP_MANIFEST } from './shared/constants/manifest';

const { resolve } = createResolver(import.meta.url);
const require = createRequire(import.meta.url);

export default defineNuxtConfig({
  modules: ['@vite-pwa/nuxt'],

  pwa: {
    pwaAssets: {
      config: resolve('./pwa-assets.config.ts'),
      includeHtmlHeadLinks: false,
      injectThemeColor: false,
    },
  },

  hooks: {
    'prepare:types'({ references }) {
      // The icons plugin is also reached from Nuxt's node/shared type contexts.
      references.push({
        path: require.resolve('vite-plugin-pwa/pwa-assets.d.ts', {
          paths: [require.resolve('@vite-pwa/nuxt')],
        }),
      });
    },
  },

  $production: {
    pwa: {
      // Use injectManifest for full control over the service worker.
      // This is required for SSR apps to properly handle offline fallbacks
      // (generateSW cannot add a setCatchHandler for navigation requests).
      strategies: 'injectManifest',
      registerType: 'autoUpdate',
      minify: true,
      manifest: APP_MANIFEST,
      srcDir: resolve('./app/service-worker'),
      filename: 'sw.ts',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 4000000,
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
      },
    },
  },

  app: {
    head: {
      link: [{ rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }],
    },
  },

  routeRules: {
    '/pwa': { ssr: true, prerender: true },
  },

  nitro: {
    prerender: { ignore: ['/pwa', '/__og-image__/static/pwa'] },
  },

  seo: {
    meta: {
      themeColor: APP_MANIFEST.theme_color,
      applicationName: APP_MANIFEST.short_name,
      appleMobileWebAppTitle: APP_MANIFEST.short_name,
      appleMobileWebAppCapable: 'yes',
      appleMobileWebAppStatusBarStyle: 'black-translucent',
      mobileWebAppCapable: 'yes',
      msapplicationTileColor: APP_MANIFEST.background_color,
      ogImage: '/pwa-512x512.png',
      twitterImage: '/pwa-512x512.png',
    },
  },
});
