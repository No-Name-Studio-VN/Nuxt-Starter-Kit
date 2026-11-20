import type { NuxtPage } from 'nuxt/schema';
import type { Locale, UnprefixedPageRule } from './types/i18n';

export type { Locale } from './types/i18n';
export const locales: readonly Locale[] = ['en', 'vi'];

export const sourceLocale: Locale = 'en';
export const defaultLocale: Locale = sourceLocale;
export const fallbackLocales: Locale[] = [sourceLocale];
export const browserFallbackLocale: Locale = sourceLocale;

export const languageNames: { [locale in Locale]: string } = {
  en: 'English',
  vi: 'Tiếng Việt',
};

// Add another predicate here to keep more pages at a single, unprefixed URL.
export const unprefixedPageRules: UnprefixedPageRule[] = [
  (page) => page.meta?.layout === 'dashboard',
  (page) => page.name === 'onboarding',
  (page) => page.path === '/settings' || page.path.startsWith('/settings/'),
];

export function isUnprefixedPage(page: NuxtPage) {
  return unprefixedPageRules.some((rule) => rule(page));
}
