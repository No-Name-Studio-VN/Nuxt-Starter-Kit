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
    '@nuxthub/core',
    // <nsk:auth>
    'nuxt-auth-utils',
    // </nsk:auth>
    '@nuxtjs/color-mode',
    '@sentry/nuxt/module',
    // <nsk:pwa>
    '@vite-pwa/nuxt',
    // </nsk:pwa>
    // <nsk:content>
    'nuxt-content-git', // this adds createdAt and updatedAt dates based on the git history.
    // </nsk:content>
    // <nsk:auth>
    '@nuxtjs/turnstile',
    // </nsk:auth>
    '@vee-validate/nuxt',
    'motion-v/nuxt',
    // <nsk:content>
    'nuxt-component-meta',
    '@/modules/navigation-redirects', // Auto-generate redirects from .navigation.yml files
    // </nsk:content>
    'nuxt-early-404',
  ],

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
    // <nsk:auth>
    turnstile: {
      secretKey: '',
    },
    // Transactional email, read by server/utils/email.ts.
    resend: {
      apiKey: '',
      fromEmail: '',
    },
    // </nsk:auth>
    // <nsk:admin>
    // Shared secret guarding the database seed endpoint.
    seed: {
      secret: '',
    },
    defaultAdminPassword: '',
    // </nsk:admin>
    // <nsk:auth>
    session: {
      password: '',
      // Without maxAge the session cookie is written with no Expires, so it only
      // lives as long as the browsing session. Desktop browsers keep (and restore)
      // that, but mobile browsers and the standalone PWA drop it every time the OS
      // kills the process, logging mobile users out constantly.
      // Counted from login, not from last activity: h3 never refreshes createdAt,
      // so this is an absolute lifetime rather than a sliding window.
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
    // </nsk:auth>
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
      tasks: true,
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
      // Pre-render the homepage
      routes: ['/'],
      ignore: [
        '/admin',
        '/admin/**',
        '/settings',
        '/settings/**',
        '/docs',
        '/docs/**',
        '/blogs',
        '/blogs/**',
        '/pwa',
        '/__og-image__/static/pwa',
        '/_studio',
        '/_studio/**',
        '/__nuxt_studio',
        '/__nuxt_studio/**',
        '/api/**', // Ignore ALL API routes (not just /api/studio/**)
        '/auth/**', // Auth0 routes should be SSR (optional, not required for Studio)
        '/admin/studio/login', // Login page should also be SSR
        '/admin/studio/login/**', // Login page with any sub-paths
      ],
    },
    typescript: {
      tsConfig: {
        // <nsk:auth>
        // Nitro's generated tsconfig includes server/ and shared/*.d.ts only, so
        // the #auth-utils augmentation in auth.d.ts never reaches server code and
        // every session.user access fails to resolve.
        include: ['../auth.d.ts'],
        // </nsk:auth>
        exclude: ['**/dist/**', '**/node_modules/**'],
      },
    },
  },

  hub: {
    // <nsk:database>
    // D1 database
    db: 'sqlite',
    // </nsk:database>
    // <nsk:server-core>
    // KV namespace (binding defaults to 'KV')
    kv: true,
    // Cache KV namespace (binding defaults to 'CACHE')
    cache: true,
    // </nsk:server-core>
    // R2 bucket (binding defaults to 'BLOB')
    blob: false,
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
      crossOriginOpenerPolicy: 'same-origin-allow-popups',
      crossOriginEmbedderPolicy: 'unsafe-none',
      contentSecurityPolicy: {
        'script-src': ["'self'", 'https:', "'unsafe-inline'", "'wasm-unsafe-eval'"],
        'style-src': ["'self'", 'https:', "'unsafe-inline'", 'https://challenges.cloudflare.com'],
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
    sourceMapsUploadOptions: {
      org: 'no-name-studio',
      project: 'nuxt-starter-kit',
      authToken: process.env.SENTRY_AUTH_TOKEN,
    },
    silent: true,
    telemetry: false,
    sourcemaps: {
      filesToDeleteAfterUpload: '*.map',
    },
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
    exclude: ['/admin/**', '/settings/**'],
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

  // <nsk:auth>
  turnstile: {
    siteKey: process.env.NUXT_TURNSTILE_SITE_KEY,
  },
  // </nsk:auth>
});
