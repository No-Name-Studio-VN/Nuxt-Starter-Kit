/**
 * Nuxt Module: Content Prerender
 *
 * Automatically discovers all content .md files and registers them
 * as prerender routes so they are generated as static HTML at build time.
 * This is critical for Cloudflare Workers free plan (10ms CPU limit)
 * where SSR is too expensive.
 */

import { defineNuxtModule } from '@nuxt/kit';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { defaultLocale, locales } from '../../../../i18n-constants';
import { isContentPathWithin } from '../utils/contentPaths';
import {
  BLOG_CONTENT_PATH,
  blogLocaleCodes,
  blogPublicPath,
  parseBlogContentPath,
} from '../utils/blogPaths';

/**
 * Recursively find all .md files in a directory
 */
function findMarkdownFiles(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;

  try {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);

        if (stat.isDirectory()) {
          findMarkdownFiles(fullPath, files);
        } else if (entry.endsWith('.md')) {
          files.push(fullPath);
        }
      } catch {
        // Skip files we can't access
      }
    }
  } catch {
    // Skip directories we can't access
  }

  return files;
}

/**
 * Convert a content file path to URL path
 * e.g. content/1.products/1.nuxt-starter-kit/1.getting-started/1.introduction.md
 *   -> /products/nuxt-starter-kit/getting-started/introduction
 */
function contentFileToUrlPath(filePath: string, contentDir: string): string {
  let relativePath = filePath.replace(contentDir, '').replace(/\\/g, '/');

  // Remove .md extension
  relativePath = relativePath.replace(/\.md$/, '');

  // Split into segments and clean each one
  const segments = relativePath.split('/').filter(Boolean);
  const cleanSegments = segments.map((segment) => {
    // Remove numeric prefix (e.g., "1.products" -> "products")
    return segment.replace(/^\d+\./, '');
  });

  // Handle index files — remove "index" from the path
  if (cleanSegments.length > 0 && cleanSegments[cleanSegments.length - 1] === 'index') {
    cleanSegments.pop();
  }

  return '/' + cleanSegments.join('/');
}

export default defineNuxtModule({
  meta: {
    name: 'content-prerender',
    configKey: 'contentPrerender',
  },

  defaults: {
    enabled: true,
  },

  setup(options, nuxt) {
    if (!options.enabled) return;

    const contentDir = join(nuxt.options.rootDir, 'content');

    // Add content routes to prerender list
    nuxt.hook('nitro:config', (nitroConfig) => {
      const markdownFiles = findMarkdownFiles(contentDir);
      const i18n = nuxt.options.i18n;
      const strategy = i18n?.strategy;
      const primaryLocale = i18n?.defaultLocale || defaultLocale;
      const localeCodes = blogLocaleCodes(i18n?.locales ?? locales);
      const otherLocales = localeCodes.filter((code) => code !== primaryLocale);
      const localizedPrefixes = strategy === 'no_prefix' ? [] : otherLocales;
      const blogPrefixes =
        strategy === 'prefix' || strategy === 'prefix_and_default'
          ? localeCodes
          : localizedPrefixes;
      const basePath =
        typeof nuxt.options.runtimeConfig.public.blogBasePath === 'string'
          ? nuxt.options.runtimeConfig.public.blogBasePath
          : BLOG_CONTENT_PATH;
      const routes = new Set<string>([
        '/rss.xml',
        ...blogPrefixes.map((locale) => `/${locale}${basePath}`),
      ]);
      if (strategy !== 'prefix') routes.add(basePath);

      for (const file of markdownFiles) {
        const urlPath = contentFileToUrlPath(file, contentDir);

        // Skip empty paths
        if (!urlPath || urlPath === '/') continue;

        const blog = parseBlogContentPath(urlPath, localeCodes, strategy === 'no_prefix');
        if (blog) {
          const locale = blog.locale === primaryLocale ? undefined : blog.locale;
          if (strategy === 'no_prefix') {
            routes.add(blogPublicPath(basePath, blog.suffix, locale));
          } else if (locale) {
            routes.add(`/${locale}${basePath}${blog.suffix}`);
          } else {
            if (strategy !== 'prefix') routes.add(basePath + blog.suffix);
            for (const code of blogPrefixes) routes.add(`/${code}${basePath}${blog.suffix}`);
          }
          continue;
        }

        routes.add(urlPath);
        if (isContentPathWithin(urlPath, '/docs')) {
          for (const locale of localizedPrefixes) {
            routes.add(`/${locale}${urlPath}`);
          }
        }
      }

      // Merge with existing prerender routes
      nitroConfig.prerender ??= {};
      nitroConfig.prerender.routes = [
        ...new Set([...(nitroConfig.prerender.routes ?? []), ...routes]),
      ];

      console.log(`[content-prerender] Registered ${routes.size} content routes for prerendering`);
      for (const route of routes) {
        console.log(`[content-prerender]   ${route}`);
      }
    });
  },
});
