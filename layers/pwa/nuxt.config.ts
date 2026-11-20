import { createResolver } from '@nuxt/kit';
import { APP_MANIFEST } from './shared/constants/manifest';

const { resolve } = createResolver(import.meta.url);

export default defineNuxtConfig({
  modules: ['@vite-pwa/nuxt'],

  i18n: {
    locales: [
      { code: 'en', file: 'en.json' },
      { code: 'vi', file: 'vi.json' },
    ],
  },

  pwa: {
    pwaAssets: {
      config: resolve('./pwa-assets.config.ts'),
      includeHtmlHeadLinks: false,
      injectThemeColor: false,
    },
  },

  $production: {
    pwa: {
      // Bundle the custom TypeScript service worker for SSR navigation fallbacks.
      strategies: 'buildSW',
      registerType: 'autoUpdate',
      minify: true,
      manifest: APP_MANIFEST,
      filename: 'sw.js',
      maximumFileSizeToCacheInBytes: 4000000,
      buildSW: {
        swSrc: resolve('./app/service-worker/sw.ts'),
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
        // Nuxt adds globs for optional prerendered payloads and build manifests.
        globStrict: false,
        // The module's default transform maps `a/b.html` to `a`, which only fits
        // `a/b/index.html` output. Cloudflare prerenders `a/b.html` (served at
        // `/a/b`), so sibling pages collide and Workbox refuses to install.
        manifestTransforms: [
          (entries) => ({
            manifest: entries
              // Nuxt's default transform gives latest.json a revision. Leave it on the network
              // instead of precaching the mutable build pointer as an immutable build asset.
              .filter((entry) => !entry.url.endsWith('/builds/latest.json'))
              .map((entry) => {
                if (!entry.url.endsWith('.html')) {
                  return entry;
                }
                const url = entry.url.replace(/^\//, '');
                if (url === 'index.html') {
                  return { ...entry, url: '/' };
                }
                return { ...entry, url: url.replace(/\/index\.html$/, '/').replace(/\.html$/, '') };
              }),
            warnings: [],
          }),
        ],
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
    },
  },
});
