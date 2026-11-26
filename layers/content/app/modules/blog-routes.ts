import { defineNuxtModule } from '@nuxt/kit';
import { BLOG_CONTENT_PATH, normalizeBlogBasePath } from '../utils/blogPaths';

export default defineNuxtModule({
  meta: { name: 'content-blog-routes', configKey: 'blog' },
  defaults: { basePath: BLOG_CONTENT_PATH },

  setup(options, nuxt) {
    const basePath = normalizeBlogBasePath(options.basePath);
    nuxt.options.runtimeConfig.public.blogBasePath = basePath;
    nuxt.options.runtimeConfig.public.blogStrategy = nuxt.options.i18n?.strategy ?? '';
    if (basePath === BLOG_CONTENT_PATH) return;

    // Remap the kit's routes before i18n generates their localized counterparts.
    nuxt.hook('pages:extend', (pages) => {
      for (const page of pages) {
        if (page.path === BLOG_CONTENT_PATH || page.path === `${BLOG_CONTENT_PATH}/:slug(.*)*`) {
          page.path = basePath + page.path.slice(BLOG_CONTENT_PATH.length);
        }
      }
    });
  },
});
