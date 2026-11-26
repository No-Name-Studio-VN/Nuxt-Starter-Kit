import { fetchLocalizedContentPage } from '#layers/content/app/composables/usePageData';
import {
  BLOG_CONTENT_PATH,
  blogContentRoots,
  blogPublicPath,
  parseBlogContentPath,
} from '#layers/content/app/utils/blogPaths';
import { formatDate } from '@/lib/utils';

export function useBlogListing() {
  const { locale, defaultLocale, availableLocales, strategy } = useI18n();
  const { blogBasePath } = useRuntimeConfig().public;
  const noPrefix = strategy === 'no_prefix';
  const otherLocales = availableLocales.filter((code) => code !== defaultLocale);

  return useAsyncData(
    () => `blog-posts:${locale.value}`,
    async () => {
      const requestedLocale = locale.value;
      const roots = blogContentRoots(requestedLocale, defaultLocale, noPrefix);
      const posts = await queryCollection('content')
        .orWhere((group) => {
          for (const root of new Set([...roots, BLOG_CONTENT_PATH])) {
            group.where('path', 'LIKE', `${root}/%`);
          }
          return group;
        })
        .select(
          'path',
          'title',
          'description',
          'publishedAt',
          'category',
          'tags',
          'image',
          'ogImage',
        )
        .order('publishedAt', 'DESC')
        .all();

      // A translated card wins over the default one regardless of publish date.
      const paths = new Set(posts.map((post) => post.path));
      return posts.flatMap((post) => {
        const location = parseBlogContentPath(post.path, otherLocales, noPrefix);
        if (!location || (location.locale && location.locale !== requestedLocale)) return [];
        const preferredPath = roots
          .map((root) => root + location.suffix)
          .find((path) => paths.has(path));
        if (preferredPath && preferredPath !== post.path) return [];
        return [
          {
            ...post,
            path: blogPublicPath(
              blogBasePath,
              location.suffix,
              noPrefix ? location.locale : undefined,
            ),
          },
        ];
      });
    },
  );
}

export function useBlogArticle(slug: string, routeLocale?: string) {
  const { locale, defaultLocale, availableLocales, strategy } = useI18n();
  const { blogBasePath } = useRuntimeConfig().public;
  const noPrefix = strategy === 'no_prefix';
  const otherLocales = availableLocales.filter((code) => code !== defaultLocale);

  return useAsyncData(
    () => `blog-post:${routeLocale ?? locale.value}:${slug}`,
    async (nuxtApp) => {
      const requestedLocale = routeLocale ?? locale.value;
      const roots = blogContentRoots(requestedLocale, defaultLocale, noPrefix);
      const entry = noPrefix
        ? null
        : await fetchLocalizedContentPage(
            nuxtApp,
            `${roots[0]}${slug}`,
            requestedLocale,
            defaultLocale,
          );
      const findPost = (path: string) =>
        nuxtApp.runWithContext(() => queryCollection('content').path(path).first());
      let post = entry?.page ?? null;
      if (noPrefix) {
        for (const root of roots) {
          post = await findPost(root + slug);
          if (post) break;
        }
      }
      const contentLocale = entry?.isFallback ? defaultLocale : requestedLocale;
      if (!post)
        return {
          post: null,
          publishedDate: '',
          morePosts: [],
          contentLocale,
          alternateLocales: [],
        };

      const currentPath = post.path;
      const relatedRoots = blogContentRoots(contentLocale, defaultLocale, noPrefix);
      const [related, variants] = await Promise.all([
        nuxtApp.runWithContext(() => {
          const query = queryCollection('content').orWhere((group) => {
            for (const root of relatedRoots) group.where('path', 'LIKE', `${root}/%`);
            return group;
          });
          if (noPrefix && contentLocale === defaultLocale) {
            for (const code of otherLocales) {
              query.where('path', 'NOT LIKE', `${BLOG_CONTENT_PATH}/${code}/%`);
            }
          }
          return query
            .where('path', '<>', currentPath)
            .order('publishedAt', 'DESC')
            .select('path', 'title', 'publishedAt', 'category', 'image', 'ogImage')
            .limit(3 * relatedRoots.length)
            .all();
        }),
        noPrefix
          ? nuxtApp.runWithContext(() =>
              queryCollection('content')
                .where(
                  'path',
                  'IN',
                  availableLocales.flatMap((code) =>
                    blogContentRoots(code, defaultLocale, true).map((root) => root + slug),
                  ),
                )
                .select('path')
                .all(),
            )
          : [],
      ]);
      const alternateLocales = variants.flatMap(({ path }) => {
        const location = parseBlogContentPath(path, otherLocales, noPrefix);
        return location ? [location.locale ?? defaultLocale] : [];
      });
      const dateLabel = (date: string | undefined, month: 'long' | 'short') =>
        formatDate(date, contentLocale, {
          year: 'numeric',
          month,
          day: 'numeric',
          timeZone: 'UTC',
        });
      const relatedSlugs = new Set([slug]);

      // Serialize labels so hydration reuses the server's Intl output.
      return {
        post,
        publishedDate: dateLabel(post.publishedAt, 'long'),
        contentLocale,
        alternateLocales: [...new Set(alternateLocales)],
        morePosts: related
          .flatMap((item) => {
            const location = parseBlogContentPath(item.path, otherLocales, noPrefix);
            if (
              !location ||
              (location.locale ?? defaultLocale) !== contentLocale ||
              relatedSlugs.has(location.suffix)
            )
              return [];
            relatedSlugs.add(location.suffix);
            return [
              {
                ...item,
                path: blogPublicPath(
                  blogBasePath,
                  location.suffix,
                  noPrefix ? location.locale : undefined,
                ),
                date: dateLabel(item.publishedAt, 'short'),
              },
            ];
          })
          .slice(0, 3),
      };
    },
  );
}
