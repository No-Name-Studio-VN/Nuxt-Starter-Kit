import {
  BLOG_CONTENT_PATH,
  blogLocaleCodes,
  remapBlogContentLink,
} from '../../app/utils/blogPaths';

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('sitemap:input', ({ urls }) => {
    const { blogBasePath, blogStrategy, i18n } = useRuntimeConfig().public;
    const noPrefix = blogStrategy === 'no_prefix';
    if (blogBasePath === BLOG_CONTENT_PATH && !noPrefix) return;

    const locales = blogLocaleCodes(i18n.locales).filter(
      (code) => !noPrefix || code !== i18n.defaultLocale,
    );
    const toPublicPath = (path: string) =>
      remapBlogContentLink(path, blogBasePath, locales, noPrefix);
    for (const [index, url] of urls.entries()) {
      if (typeof url === 'string') urls[index] = toPublicPath(url);
      else if (typeof url.loc === 'string') urls[index] = { ...url, loc: toPublicPath(url.loc) };
    }
  });
});
