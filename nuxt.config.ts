import { APP_MANIFEST, SEO_CONFIG } from './shared/constants/manifest';
import { routeRules } from './shared/apiRoutes';
import { defaultLocale, browserFallbackLocale, languageNames, locales } from './i18n-constants';
import { SITE_CONFIG } from './site.config';

export default defineNuxtConfig({
  modules: [
    'nuxt-security',
    'shadcn-nuxt',
    '@vueuse/nuxt',
    '@nuxtjs/seo',
    '@nuxtjs/i18n',
    '@nuxt/fonts',
    '@nuxt/image',
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss',
    '@nuxtjs/device',
    '@nuxtjs/color-mode',
    '@sentry/nuxt/module',
    '@vee-validate/nuxt',
    'motion-v/nuxt',
    // Keep last: lists the handlers and pages every other module registered. Routes
    // everything else to static assets so unknown URLs never cost Worker CPU.
    '@/modules/worker-routes',
  ],

  experimental: {
    localLayerAliases: false,
    early404: true,
    stripNeverHydratedData: true,
    prerenderErrorPages: true,
    navigateToEarlyReturn: true,
  },

  $production: {
    image: {
      provider: 'cloudflare',
      cloudflare: { baseURL: '/' },
    },
  },

  devtools: {
    enabled: true,

    timeline: {
      enabled: true,
    },
  },

  app: {
    // pageTransition: { name: 'page', mode: 'out-in' }, currently disabled because sometimes page transitions can cause issues with the page not loading properly, especially when navigating between pages with different layouts.
    head: {
      title: APP_MANIFEST.name,
      link: [
        { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
        { rel: 'icon', href: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
      meta: [{ name: 'keywords', content: SEO_CONFIG.keywords }],
    },
  },

  css: ['~/assets/css/tailwind.css'],

  site: {
    url: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
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
      version: process.env.npm_package_version || '0.0.0',
      sentry: {
        dsn: '',
      },
      url: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      site: SITE_CONFIG,
      umami: {
        src: '',
        dataWebsiteId: '',
      },
    },
  },

  routeRules: routeRules,
  compatibilityDate: '2026-01-30',
  nitro: {
    compressPublicAssets: true,
    minify: true,
    preset: 'cloudflare-module',
    experimental: {
      openAPI: true,
      wasm: true,
    },
    wasm: {
      esmImport: true,
      lazy: true,
      silent: true,
    },
    rollupConfig: {
      external: ['sharp', /^@img\/sharp.*/],
      output: {
        generatedCode: {
          constBindings: true,
        },
      },
    },
    cloudflare: {
      // deployConfig writes the merged binding spec to
      // .output/server/wrangler.json at build time — the SINGLE source of
      // truth for the Worker config; there is no hand-maintained
      // wrangler.json. Deploy: wrangler deploy --config .output/server/wrangler.json
      deployConfig: true,
      nodeCompat: true,
      wrangler: {
        compatibility_date: '2026-06-16',
        compatibility_flags: ['nodejs_compat'],
        workers_dev: false,
        observability: {
          logs: { enabled: true, invocation_logs: true },
        },
      },
    },
    prerender: {
      // Public pages are served as static files; the Worker renders routes that
      // fail to prerender (see app/modules/worker-routes.ts). 404.html is what
      // Cloudflare serves for unknown URLs.
      routes: ['/', '/en', '/404.html', '/robots.txt'],
      // A page that fails to prerender stays on the Worker and is reported by
      // app/modules/worker-routes.ts instead of failing the build.
      failOnError: false,
      ignore: ['/api/**'],
    },
    typescript: {
      tsConfig: {
        exclude: ['**/dist/**', '**/node_modules/**'],
      },
    },
  },

  vite: {
    optimizeDeps: {
      include: ['clsx', 'reka-ui', 'tailwind-merge'],
    },
    build: {
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        external: ['sharp'],
      },
    },
  },

  sourcemap: {
    server: true,
    client: false,
  },

  fonts: {
    families: [
      {
        name: 'DM Sans',
        preload: true,
        provider: 'google',
        global: true,
      },
      {
        name: 'Inter',
        preload: true,
        provider: 'google',
        global: true,
      },
    ],
  },

  i18n: {
    strategy: 'prefix_except_default',
    defaultLocale,
    vueI18n: './i18n.config.ts',
    detectBrowserLanguage: {
      fallbackLocale: browserFallbackLocale,
    },
    locales: locales.map((locale) => ({
      name: languageNames[locale],
      code: locale,
      file: `${locale}.json`,
    })),
  },

  // currently we are disabling this since it makes server build file size very large due to the sharp dependency. You can re-enable it if you need dynamic OG image generation.
  ogImage: false,

  schemaOrg: {
    identity: 'Organization',
  },

  security: {
    // we have to disable some of the security features in order to allow prerender work. If enabled, headers file will contain a lot of nonce and when deploy will cause Cloudflare to reject the worker due to header line limit exceeded
    strict: true,
    rateLimiter: false,
    nonce: false,
    ssg: false,
    sri: false,
    headers: {
      crossOriginEmbedderPolicy: 'unsafe-none',
      contentSecurityPolicy: {
        'script-src': ["'self'", 'https:', "'unsafe-inline'", "'wasm-unsafe-eval'"],
        'style-src': ["'self'", 'https:', "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'https:'],
        'media-src': ["'self'", 'blob:', 'https:'],
        'connect-src': ["'self'", 'https:'],
        'font-src': ["'self'", 'https://*.gstatic.com'],
        'worker-src': ["'self'", 'blob:'],
        'frame-src': ["'self'", 'https:'],
      },
      permissionsPolicy: {
        fullscreen: ['self'],
        'picture-in-picture': ['self'],
        'web-share': ['self'],
        autoplay: ['self'],
      },
    },
  },

  sentry: {
    org: 'no-name-studio',
    project: 'nuxt-starter-kit',
    authToken: process.env.SENTRY_AUTH_TOKEN,
    silent: true,
    telemetry: false,
    sourcemaps: {
      filesToDeleteAfterUpload: '*.map',
    },
  },

  seo: {
    meta: {
      description: APP_MANIFEST.description,
      charset: 'utf-8',
      viewport:
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
      twitterTitle: APP_MANIFEST.name,
      twitterDescription: APP_MANIFEST.description,
      ogImage: '/social-preview.png',
      twitterImage: '/social-preview.png',
    },
  },

  shadcn: {
    prefix: '',
    componentDir: './app/components/ui',
  },

  sitemap: {
    zeroRuntime: true,
  },
});
