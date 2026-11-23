import { fetchLocalizedContentPage } from '#layers/content/app/composables/usePageData';
import {
  normalizeContentPath,
  stripContentLocalePrefix,
} from '#layers/content/app/utils/contentPaths';
import { formatDate } from '@/lib/utils';

export function useBlogListing() {
  const { locale, defaultLocale } = useI18n();

  return useAsyncData(
    () => `blog-posts:${locale.value}`,
    async () => {
      const requestedLocale = locale.value;
      const query = queryCollection('content').orWhere((group) => {
        group.where('path', 'LIKE', '/blogs/%');
        if (requestedLocale !== defaultLocale) {
          group.where('path', 'LIKE', `/${requestedLocale}/blogs/%`);
        }
        return group;
      });
      const posts = await query
        .select('path', 'title', 'description', 'publishedAt', 'category', 'tags', 'ogImage')
        .order('publishedAt', 'DESC')
        .all();

      // Use the translated card once for each public slug, even if the original
      // sorts ahead of it. Default-language cards fill gaps in the translation.
      const paths = new Set(posts.map((post) => post.path));
      return posts.flatMap((post) => {
        const path = normalizeContentPath(post.path, requestedLocale, defaultLocale);
        if (
          path === post.path &&
          requestedLocale !== defaultLocale &&
          paths.has(`/${requestedLocale}${path}`)
        ) {
          return [];
        }
        return [{ ...post, path }];
      });
    },
  );
}

export function useBlogArticle(path: string) {
  const { locale, defaultLocale } = useI18n();

  return useAsyncData(
    () => `blog-post:${locale.value}:${path}`,
    async (nuxtApp) => {
      const requestedLocale = locale.value;
      const slug = normalizeContentPath(path, requestedLocale, defaultLocale);
      const contentPath = requestedLocale === defaultLocale ? slug : `/${requestedLocale}${slug}`;
      const entry = await fetchLocalizedContentPage(
        nuxtApp,
        contentPath,
        requestedLocale,
        defaultLocale,
      );
      const contentLocale = entry?.isFallback ? defaultLocale : requestedLocale;
      if (!entry) return { post: null, publishedDate: '', morePosts: [], contentLocale };

      const { page: post } = entry;
      const directory = contentLocale === defaultLocale ? '/blogs' : `/${contentLocale}/blogs`;
      const morePosts = await nuxtApp.runWithContext(() =>
        queryCollection('content')
          .where('path', 'LIKE', `${directory}/%`)
          .where('path', '<>', post.path)
          .order('publishedAt', 'DESC')
          .select('path', 'title', 'publishedAt', 'category', 'image', 'ogImage')
          .limit(3)
          .all(),
      );

      const dateLabel = (date: string | undefined, month: 'long' | 'short') =>
        formatDate(date, contentLocale, {
          year: 'numeric',
          month,
          day: 'numeric',
          timeZone: 'UTC',
        });

      // Serialize labels so hydration reuses the server's Intl output.
      return {
        post,
        publishedDate: dateLabel(post.publishedAt, 'long'),
        contentLocale,
        morePosts: morePosts.map((item) => ({
          ...item,
          path: stripContentLocalePrefix(item.path, contentLocale),
          date: dateLabel(item.publishedAt, 'short'),
        })),
      };
    },
  );
}
