import type { ContentNavigationItem } from '@nuxt/content';
import { usePageData } from '#layers/content/app/composables/usePageData';
import {
  hasContentLocalePrefix,
  normalizeContentPath,
  stripContentLocalePrefix,
} from '../utils/contentPaths';

function normalizeNavigationItem(item: ContentNavigationItem, locale: string): ContentNavigationItem {
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
  const { locale, defaultLocale, availableLocales } = useI18n();
  const otherLocales = availableLocales.filter((code) => code !== defaultLocale);
  const route = useRoute();
  const path = computed(() => normalizeContentPath(route.path, locale.value, defaultLocale));
  const { navigation } = usePageData();

  const localizedNavigation = computed(() => {
    if (!navigation.value) return null;
    if (!otherLocales.length) return navigation.value;

    const base = navigation.value.filter(
      (item) => !otherLocales.some((code) => hasContentLocalePrefix(item.path, code)),
    );
    if (locale.value === defaultLocale) return base;

    const translated = navigation.value
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
