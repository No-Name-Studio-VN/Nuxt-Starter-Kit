import { APP_MANIFEST, SEO_CONFIG } from './shared/constants/manifest';
import { routeRules } from './shared/apiRoutes';
import { defaultLocale, browserFallbackLocale, languageNames, locales } from './i18n-constants';
import { DOCS_CONFIG } from './docs.config';

export default defineNuxtConfig({
  modules: [
    'nuxt-security',
    'shadcn-nuxt',
    '@vueuse/nuxt',
    '@nuxtjs/seo',
    '@nuxtjs/i18n',
    // <nsk:content>
    'nuxt-studio',
    '@nuxt/content',
    // </nsk:content>
    '@nuxt/fonts',
    '@nuxt/image',
    '@pinia/nuxt',
    '@nuxtjs/tailwindcss',
    '@nuxtjs/device',
    '@nuxtjs/color-mode',
    '@sentry/nuxt/module',
    // <nsk:pwa>
    '@vite-pwa/nuxt',
    // </nsk:pwa>
    // <nsk:content>
    'nuxt-content-git', // this adds createdAt and updatedAt dates based on the git history.
    // </nsk:content>
    '@vee-validate/nuxt',
    'motion-v/nuxt',
    // <nsk:content>
    'nuxt-component-meta',
    '@/modules/navigation-redirects', // Auto-generate redirects from .navigation.yml files
    '@/modules/content-prerender', // Pre-render all content pages as static HTML
    // </nsk:content>
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
    // <nsk:pwa>
    pwa: {
      // Use injectManifest for full control over the service worker.
      // This is required for SSR apps to properly handle offline fallbacks
      // (generateSW cannot add a setCatchHandler for navigation requests).
      strategies: 'injectManifest',
      registerType: 'autoUpdate',
      minify: true,
      manifest: APP_MANIFEST,
      srcDir: 'service-worker',
      filename: 'sw.ts',
      injectManifest: {
        maximumFileSizeToCacheInBytes: 4000000,
        globPatterns: ['**/*.{js,css,html,svg,ico,woff2}'],
      },
    },
    // </nsk:pwa>
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
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
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

  // <nsk:content>
  content: {
    build: {
      markdown: {
        highlight: {
          theme: {
            default: 'github-light',
            dark: 'github-dark',
          },
          preload: [
            'json',
            'js',
            'ts',
            'html',
            'css',
            'vue',
            'diff',
            'shell',
            'markdown',
            'mdc',
            'yaml',
            'bash',
            'ini',
            'dotenv',
          ],
        },
      },
    },
  },
  // </nsk:content>

  // <nsk:content>
  mdc: {
    highlight: {
      theme: {
        default: 'github-light',
        dark: 'github-dark',
      },
      langs: [
        'json',
        'js',
        'ts',
        'html',
        'css',
        'vue',
        'diff',
        'shell',
        'markdown',
        'mdc',
        'yaml',
        'bash',
        'ini',
        'dotenv',
      ],
    },
  },
  // </nsk:content>

  runtimeConfig: {
    public: {
      version: process.env.npm_package_version || '0.0.0',
      sentry: {
        dsn: '',
      },
      url: process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000',
      docs: DOCS_CONFIG,
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
      // Public pages are served as static files; the Worker renders the rest
      // (auth, dashboard, admin) and routes listed here that fail to prerender
      // (see app/modules/worker-routes.ts). 404.html is what Cloudflare serves
      // for unknown URLs.
      routes: [
        '/',
        '/en',
        // <nsk:content>
        '/blogs',
        '/en/blogs',
        '/rss.xml',
        // </nsk:content>
        '/404.html',
        '/robots.txt',
      ],
      // A page that fails to prerender stays on the Worker and is reported by
      // app/modules/worker-routes.ts instead of failing the build.
      failOnError: false,
      ignore: [
        '/pwa',
        '/__og-image__/static/pwa',
        '/_studio',
        '/_studio/**',
        '/__nuxt_studio',
        '/__nuxt_studio/**',
        '/api/**', // Ignore ALL API routes (not just /api/studio/**)
        '/admin/studio/login', // Login page should also be SSR
        '/admin/studio/login/**', // Login page with any sub-paths
      ],
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

  // <nsk:content>
  hooks: {
    'content:file:afterParse': function (ctx) {
      // Add computed fields after parsing
      const wordCount = ctx.file.body?.split(/\s+/).length || 0;
      ctx.content.readingTime = Math.ceil(wordCount / 180);
    },
  },
  // </nsk:content>

  // <nsk:auth-passkeys>
  auth: {
    webAuthn: true,
  },
  // </nsk:auth-passkeys>

  // <nsk:content>
  componentMeta: {
    // Exclude problematic paths that cause Windows path resolution issues
    exclude: [/node_modules/, /\.nuxt/, /\.output/, /dist/, /\.component-meta/],
    // Only scan components from our local directories
    // Components in /components/content are automatically available in Nuxt Studio
    componentDirs: [
      {
        path: './app/components/content',
      },
    ],
  },
  // </nsk:content>

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
      themeColor: APP_MANIFEST.theme_color,
      applicationName: APP_MANIFEST.short_name,
      appleMobileWebAppTitle: APP_MANIFEST.short_name,
      appleMobileWebAppCapable: 'yes',
      appleMobileWebAppStatusBarStyle: 'black-translucent',
      mobileWebAppCapable: 'yes',
      msapplicationTileColor: APP_MANIFEST.background_color,
      charset: 'utf-8',
      viewport:
        'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover',
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

  sitemap: {
    zeroRuntime: true,
  },

  // <nsk:content>
  studio: {
    route: '/admin/studio',
    repository: {
      provider: 'github',
      owner: 'No-Name-Studio-VN',
      repo: 'Nuxt-Starter-Kit',
      branch: 'main',
    },
  },
  // </nsk:content>
});
