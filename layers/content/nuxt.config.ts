import { createResolver } from '@nuxt/kit';
import { DOCS_CONFIG } from './docs.config';
import { BLOG_CONTENT_PATH } from './app/utils/blogPaths';

const { resolve } = createResolver(import.meta.url);

export default defineNuxtConfig({
  modules: [
    '@nuxt/content',
    'nuxt-content-git',
    resolve('./app/modules/navigation-redirects'),
    resolve('./app/modules/blog-routes'),
    resolve('./app/modules/content-prerender'),
  ],
  runtimeConfig: {
    public: { docs: DOCS_CONFIG, blogBasePath: BLOG_CONTENT_PATH, blogStrategy: '' },
  },
  i18n: {
    locales: [
      { code: 'en', file: 'en.json' },
      { code: 'vi', file: 'vi.json' },
    ],
  },
  workerRoutes: { internalPrefixes: ['/__nuxt_content/'] },
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
