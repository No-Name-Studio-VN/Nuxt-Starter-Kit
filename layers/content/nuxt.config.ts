import { createResolver } from '@nuxt/kit';
import { DOCS_CONFIG } from './docs.config';

const { resolve } = createResolver(import.meta.url);

const routeRules = {
  '/_studio/**': { ssr: true },
  '/__nuxt_studio/**': { ssr: true },
  '/admin/studio/login': { ssr: true, index: false },
  '/admin/studio/login/**': { ssr: true, index: false },
};

export default defineNuxtConfig({
  modules: [
    'nuxt-studio',
    '@nuxt/content',
    'nuxt-content-git',
    'nuxt-component-meta',
    resolve('./app/modules/navigation-redirects'),
    resolve('./app/modules/content-prerender'),
  ],
  css: [resolve('./app/assets/css/content.css')],
  runtimeConfig: { public: { docs: DOCS_CONFIG } },
  i18n: {
    locales: [
      { code: 'en', file: 'en.json' },
      { code: 'vi', file: 'vi.json' },
    ],
  },
  workerRoutes: { internalPrefixes: ['/__nuxt_content/'] },
  nitro: {
    prerender: {
      routes: ['/blogs', '/en/blogs', '/rss.xml'],
      ignore: [
        '/_studio',
        '/_studio/**',
        '/__nuxt_studio',
        '/__nuxt_studio/**',
        '/admin/studio/login',
        '/admin/studio/login/**',
      ],
    },
  },
  routeRules,
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

  hooks: {
    'content:file:afterParse': function (ctx) {
      // Add computed fields after parsing
      const wordCount = ctx.file.body?.split(/\s+/).length || 0;
      ctx.content.readingTime = Math.ceil(wordCount / 180);
    },
  },

  componentMeta: {
    // Exclude problematic paths that cause Windows path resolution issues
    exclude: [/node_modules/, /\.nuxt/, /\.output/, /dist/, /\.component-meta/],
    // Only scan components from our local directories
    // Components in /components/content are automatically available in Nuxt Studio
    componentDirs: [
      {
        path: resolve('./app/components/content'),
      },
    ],
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
