import pwaConfig from './pwa.config'
import { APP_MANIFEST, SEO_CONFIG } from './app/constants/manifest'

export default defineNuxtConfig({
  modules: [
    'shadcn-nuxt',
    '@vueuse/nuxt',
    '@nuxt/content',
    '@nuxt/eslint',
    '@nuxt/fonts',
    '@nuxt/image',
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss',
    '@vite-pwa/nuxt',
    '@nuxtjs/device',
    '@nuxthub/core',
    'nuxt-auth-utils',
    '@nuxtjs/color-mode',
    'nuxt-security',
    '@nuxtjs/robots',
    '@nuxtjs/sitemap',
    'nuxt-schema-org',
    'nuxt-seo-utils',
  ],
  $development: {
    devtools: {
      enabled: true,
    },
    security: {
      strict: false,
      headers: {
        contentSecurityPolicy: false,
        permissionsPolicy: {
          fullscreen: ['self'],
        },
      },
      rateLimiter: false,
    },
  },

  $production: {
    app: {
      head: {
        title: APP_MANIFEST.name,
        link: [
          { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
          { rel: 'icon', href: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          { rel: 'apple-touch-icon', href: '/apple-touch-icon-180x180.png' },
        ],
      },
    },

    site: {
      url: 'nnsvn.me',
      name: APP_MANIFEST.name,
    },

    colorMode: {
      preference: 'system', // default value of $colorMode.preference
      fallback: 'light', // fallback value if not system preference found
      classSuffix: '',
      storage: 'cookie',
      disableTransition: true,
    },

    runtimeConfig: {
      public: {
        NUXT_APP_VERSION: process.env.npm_package_version || '0.0.0',
      },
    },

    routeRules: {
      '/api/**': {
        security: {
          rateLimiter: {
            tokensPerInterval: 250,
            interval: 60000,
            headers: true,
            throwError: true,
          },
        },
      },
      'experimental': {
        emitRouteChunkError: 'automatic-immediate',
      },
      'nitro': {
        compressPublicAssets: true,
        minify: true,
        experimental: {
          openAPI: true,
          wasm: true,
        },
        cloudflare: {
          nodeCompat: true,
        },
      },

      'pwa': pwaConfig,
    },

    compatibilityDate: '2025-09-15',

    hub: {
      cache: true,
      bindings: {
        observability: {
          logs: true,
        },
        compatibilityDate: '2025-09-15',
      },
      database: true,
      kv: true,
      blob: false,
    },

    eslint: {
      config: {
        stylistic: {
          semi: false,
          quotes: 'single',
          indent: 2,
        },
      },
    },

    fonts: {
      families: [
        {
          name: 'Manrope',
          preload: true,
          provider: 'google',
          global: true,
        },
      ],
    },

    schemaOrg: {
      identity: 'Organization',
    },

    seo: {
      meta: {
        description: APP_MANIFEST.description,
        keywords: SEO_CONFIG.keywords,
        themeColor: APP_MANIFEST.theme_color,
        applicationName: APP_MANIFEST.short_name,
        appleMobileWebAppTitle: APP_MANIFEST.short_name,
        appleMobileWebAppCapable: 'yes',
        appleMobileWebAppStatusBarStyle: 'black-translucent',
        mobileWebAppCapable: 'yes',
        msapplicationTileColor: APP_MANIFEST.background_color,
        charset: 'utf-8',
        viewport: 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no',
        ogImage: '/pwa-512x512.png',
        twitterTitle: APP_MANIFEST.name,
        twitterDescription: APP_MANIFEST.description,
        twitterImage: '/pwa-512x512.png',
      },
    },

    shadcn: {
      prefix: '',
      componentDir: './app/components/ui',
    },
  },
})
