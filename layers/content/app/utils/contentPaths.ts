export function hasContentLocalePrefix(path: string, locale: string): boolean {
  return path === `/${locale}` || path.startsWith(`/${locale}/`);
}

export function stripContentLocalePrefix(path: string, locale: string): string {
  return hasContentLocalePrefix(path, locale) ? path.slice(locale.length + 1) || '/' : path;
}

export function normalizeContentPath(path: string, locale: string, defaultLocale: string): string {
  const unprefixed = locale === defaultLocale ? path : stripContentLocalePrefix(path, locale);
  return unprefixed.replace(/\/+$/, '') || '/';
}

export function isContentPathWithin(path: string, parent: string): boolean {
  return path === parent || path.startsWith(`${parent}/`);
}
