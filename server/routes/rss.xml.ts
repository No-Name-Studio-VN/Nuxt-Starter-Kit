import { Feed } from 'feed';
import { queryCollection } from '@nuxt/content/server';
import { hasProtocol, withoutTrailingSlash } from 'ufo';
import { defaultLocale } from '../../i18n-constants';
import { APP_MANIFEST } from '#shared/constants/manifest';

// Prerendered at build time (nitro.prerender.routes), so this only runs during the build.
export default defineEventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig();
  const siteUrl = withoutTrailingSlash(runtimeConfig.public.url as string);
  // NUXT_PUBLIC_SITE_URL is configured without a scheme ("nnsvn.me"), which Feed rejects.
  const url = hasProtocol(siteUrl) ? siteUrl : `https://${siteUrl}`;

  const now = new Date();

  const feed = new Feed({
    title: APP_MANIFEST.name,
    description: APP_MANIFEST.description,
    id: url,
    link: url,
    language: defaultLocale,
    favicon: `${url}/favicon.ico`,
    copyright: `All rights reserved ${now.getFullYear()}, ${APP_MANIFEST.short_name}`,
  });

  // The collection has no `draft` field. Only blog posts belong in the feed:
  // privacy and terms carry a publishedAt too.
  const posts = await queryCollection(event, 'content')
    .select('title', 'path', 'description', 'publishedAt', 'category')
    .where('path', 'LIKE', '/blogs/%')
    .where('publishedAt', 'IS NOT NULL')
    .order('publishedAt', 'DESC')
    .all();

  for (const post of posts) {
    if (!post.publishedAt) continue;

    feed.addItem({
      title: post.title ?? '-',
      id: withoutTrailingSlash(url + post.path),
      link: withoutTrailingSlash(url + post.path),
      description: post.description,
      date: new Date(post.publishedAt),
      category: post.category ? [{ name: post.category }] : undefined,
    });
  }

  event.node.res.setHeader('content-type', 'text/xml');
  return feed.rss2();
});
