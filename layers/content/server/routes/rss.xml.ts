import { Feed } from 'feed';
import { queryCollection } from '@nuxt/content/server';
import { hasProtocol, withoutTrailingSlash } from 'ufo';
import { APP_MANIFEST } from '#shared/constants/manifest';
import {
  BLOG_CONTENT_PATH,
  blogLocaleCodes,
  blogPublicPath,
  parseBlogContentPath,
} from '../../app/utils/blogPaths';

// Prerendered at build time (nitro.prerender.routes), so this only runs during the build.
export default defineEventHandler(async (event) => {
  const { blogBasePath, blogStrategy, i18n, url: configuredUrl } = useRuntimeConfig(event).public;
  const basePath =
    blogStrategy === 'prefix' ? `/${i18n.defaultLocale}${blogBasePath}` : blogBasePath;
  const siteUrl = withoutTrailingSlash(configuredUrl);
  // NUXT_PUBLIC_SITE_URL is configured without a scheme ("nnsvn.me"), which Feed rejects.
  const url = hasProtocol(siteUrl) ? siteUrl : `https://${siteUrl}`;

  const now = new Date();

  const feed = new Feed({
    title: APP_MANIFEST.name,
    description: APP_MANIFEST.description,
    id: url,
    link: url,
    language: i18n.defaultLocale,
    favicon: `${url}/favicon.ico`,
    copyright: `All rights reserved ${now.getFullYear()}, ${APP_MANIFEST.short_name}`,
  });

  // The collection has no `draft` field. Only blog posts belong in the feed:
  // privacy and terms carry a publishedAt too.
  const posts = await queryCollection(event, 'content')
    .select('title', 'path', 'description', 'publishedAt', 'category')
    .where('path', 'LIKE', `${BLOG_CONTENT_PATH}/%`)
    .where('publishedAt', 'IS NOT NULL')
    .order('publishedAt', 'DESC')
    .all();

  const otherLocales = blogLocaleCodes(i18n.locales).filter((code) => code !== i18n.defaultLocale);
  for (const post of posts) {
    const location = parseBlogContentPath(post.path, otherLocales, blogStrategy === 'no_prefix');
    if (!post.publishedAt || !location || location.locale) continue;
    const link = withoutTrailingSlash(url + blogPublicPath(basePath, location.suffix));

    feed.addItem({
      title: post.title ?? '-',
      id: link,
      link,
      description: post.description,
      date: new Date(post.publishedAt),
      category: post.category ? [{ name: post.category }] : undefined,
    });
  }

  event.node.res.setHeader('content-type', 'text/xml');
  return feed.rss2();
});
