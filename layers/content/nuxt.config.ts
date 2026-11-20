import { createResolver } from '@nuxt/kit';
import { DOCS_CONFIG } from './docs.config';
import { defaultLocale, locales } from '../../i18n-constants';

const { resolve } = createResolver(import.meta.url);

export default defineNuxtConfig({
  modules: [
    '@nuxt/content',
    'nuxt-content-git',
    resolve('./app/modules/navigation-redirects'),
    resolve('./app/modules/content-prerender'),
  ],
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
      routes: [
        '/blogs',
        ...locales.filter((locale) => locale !== defaultLocale).map((locale) => `/${locale}/blogs`),
        '/rss.xml',
      ],
    },
  },
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
});
