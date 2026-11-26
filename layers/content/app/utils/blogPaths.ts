import { isContentPathWithin, stripContentLocalePrefix } from './contentPaths';

export const BLOG_CONTENT_PATH = '/blogs';

export function blogLocaleCodes(locales: readonly (string | { code?: string })[] = []): string[] {
  return locales.flatMap((locale) =>
    typeof locale === 'string' ? [locale] : locale.code ? [locale.code] : [],
  );
}

export function normalizeBlogBasePath(path: string): string {
  const basePath = path.trim().replace(/\/+$/, '');
  if (!/^(?:\/[\w-]+)+$/.test(basePath)) {
    throw new Error('blog.basePath must be a non-root local path such as /news.');
  }
  return basePath;
}

// Content supports locale folders before the blog directory. No-prefix sites
// can also keep translations inside it, with the locale exposed in article URLs.
export function parseBlogContentPath(path: string, locales: readonly string[], noPrefix: boolean) {
  const prefixLocale = locales.find((code) =>
    isContentPathWithin(path, `/${code}${BLOG_CONTENT_PATH}`),
  );
  const unprefixed = prefixLocale ? stripContentLocalePrefix(path, prefixLocale) : path;
  if (!isContentPathWithin(unprefixed, BLOG_CONTENT_PATH)) return undefined;

  const suffix = unprefixed.slice(BLOG_CONTENT_PATH.length);
  const nestedLocale =
    noPrefix && !prefixLocale
      ? locales.find((code) => isContentPathWithin(suffix, `/${code}`))
      : undefined;
  return {
    locale: prefixLocale ?? nestedLocale,
    suffix: nestedLocale ? stripContentLocalePrefix(suffix, nestedLocale) : suffix,
  };
}

export function blogPublicPath(basePath: string, suffix: string, locale?: string): string {
  return `${basePath}${locale ? `/${locale}` : ''}${suffix}`;
}

// Keep search anchors and redirect queries attached to the remapped path.
export function remapBlogContentLink(
  link: string,
  basePath: string,
  locales: readonly string[],
  noPrefix: boolean,
): string {
  const end = link.search(/[?#]/);
  const pathname = end === -1 ? link : link.slice(0, end);
  const post = parseBlogContentPath(pathname, locales, noPrefix);
  if (!post) return link;

  const extra = end === -1 ? '' : link.slice(end);
  if (noPrefix) return blogPublicPath(basePath, post.suffix, post.locale) + extra;
  return (post.locale ? `/${post.locale}` : '') + basePath + post.suffix + extra;
}

export function blogContentRoots(
  locale: string,
  defaultLocale: string,
  noPrefix: boolean,
): string[] {
  if (locale === defaultLocale) return [BLOG_CONTENT_PATH];
  const prefixed = `/${locale}${BLOG_CONTENT_PATH}`;
  return noPrefix ? [`${BLOG_CONTENT_PATH}/${locale}`, prefixed] : [prefixed];
}
