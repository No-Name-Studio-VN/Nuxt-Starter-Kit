import type { ContentNavigationItem } from '@nuxt/content';
import { usePageData } from '#layers/content/app/composables/usePageData';
import { BLOG_CONTENT_PATH, remapBlogContentLink } from '../utils/blogPaths';
import {
  hasContentLocalePrefix,
  normalizeContentPath,
  stripContentLocalePrefix,
} from '../utils/contentPaths';

function normalizeNavigationItem(
  item: ContentNavigationItem,
  locale: string,
): ContentNavigationItem {
  return {
    ...item,
    path: stripContentLocalePrefix(item.path, locale),
    ...(typeof item.redirect === 'string'
      ? { redirect: stripContentLocalePrefix(item.redirect, locale) }
      : {}),
    ...(item.children
      ? { children: item.children.map((child) => normalizeNavigationItem(child, locale)) }
      : {}),
  };
}

// Keep default-locale reading order and add locale-only pages after matching siblings.
function mergeNavigation(
  base: ContentNavigationItem[],
  translated: ContentNavigationItem[],
): ContentNavigationItem[] {
  const byPath = new Map(translated.map((item) => [item.path, item]));
  const merged = base.map((item) => {
    const translation = byPath.get(item.path);
    if (!translation) return item;
    byPath.delete(item.path);
    return {
      ...item,
      ...translation,
      ...(item.children || translation.children
        ? { children: mergeNavigation(item.children ?? [], translation.children ?? []) }
        : {}),
    };
  });
  return [...merged, ...byPath.values()];
}

export function useI18nDocs() {
  const { locale, defaultLocale, availableLocales, strategy } = useI18n();
  const { blogBasePath } = useRuntimeConfig().public;
  const noPrefix = strategy === 'no_prefix';
  const blogLink = (path: string) =>
    remapBlogContentLink(
      path,
      blogBasePath,
      availableLocales.filter((code) => code !== defaultLocale),
      noPrefix,
    );
  function remapBlogLinks(item: ContentNavigationItem): ContentNavigationItem {
    return {
      ...item,
      path: blogLink(item.path),
      ...(typeof item.redirect === 'string' ? { redirect: blogLink(item.redirect) } : {}),
      ...(item.children ? { children: item.children.map(remapBlogLinks) } : {}),
    };
  }
  const otherLocales = availableLocales.filter((code) => code !== defaultLocale);
  const route = useRoute();
  const path = computed(() => normalizeContentPath(route.path, locale.value, defaultLocale));
  const { navigation } = usePageData();

  const localizedNavigation = computed(() => {
    if (!navigation.value) return null;
    const tree =
      blogBasePath === BLOG_CONTENT_PATH && !noPrefix
        ? navigation.value
        : navigation.value.map(remapBlogLinks);
    if (!otherLocales.length) return tree;

    const base = tree.filter(
      (item) => !otherLocales.some((code) => hasContentLocalePrefix(item.path, code)),
    );
    if (locale.value === defaultLocale) return base;

    const translated = tree
      .filter((item) => item.path === `/${locale.value}`)
      .flatMap((item) => item.children ?? [])
      .map((item) => normalizeNavigationItem(item, locale.value));
    return translated.length ? mergeNavigation(base, translated) : base;
  });

  return {
    i18nEnabled: otherLocales.length > 0,
    navigation: localizedNavigation,
    path,
  };
}
