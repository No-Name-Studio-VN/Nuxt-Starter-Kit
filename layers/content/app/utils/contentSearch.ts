import { hasContentLocalePrefix, stripContentLocalePrefix } from './contentPaths';

export function localizeSearchSections<T extends { id: string }>(
  sections: T[],
  locale: string,
  defaultLocale: string,
  availableLocales: readonly string[],
): T[] {
  const otherLocales = availableLocales.filter((code) => code !== defaultLocale);
  const translated: T[] = [];
  const defaults: T[] = [];
  const translatedPaths = new Set<string>();

  for (const section of sections) {
    const path = section.id.split('#', 1)[0] ?? '';
    if (locale !== defaultLocale && hasContentLocalePrefix(path, locale)) {
      const unprefixed = stripContentLocalePrefix(path, locale);
      translatedPaths.add(unprefixed);
      translated.push({ ...section, id: unprefixed + section.id.slice(path.length) });
    } else if (!otherLocales.some((code) => hasContentLocalePrefix(path, code))) {
      defaults.push(section);
    }
  }

  // A translated page can have different headings, so don't index default anchors for it.
  return [
    ...defaults.filter((section) => !translatedPaths.has(section.id.split('#', 1)[0] ?? '')),
    ...translated,
  ];
}
