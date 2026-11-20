import type { NavigationItem } from '#layers/content/types';

/**
 * Recursively find a navigation item matching the given path.
 */
function findInNavigation(
  items: NavigationItem[],
  path: string,
): NavigationItem | null {
  for (const item of items) {
    if (item.path === path) return item;
    if (item.children) {
      const found = findInNavigation(item.children, path);
      if (found) return found;
    }
  }
  return null;
}

function firstNavigablePath(item: NavigationItem): string | undefined {
  if (typeof item.redirect === 'string' && item.redirect !== item.path) return item.redirect;
  if (item.page !== false) return item.path;
  for (const child of item.children ?? []) {
    const path = firstNavigablePath(child);
    if (path) return path;
  }
  return undefined;
}

// i18n cannot localize unnamed redirect-only records, or folders with no index page.
export function navTargetFromPath(
  path: string,
  navigation: NavigationItem[] | null | undefined,
): string {
  const item = navigation && findInNavigation(navigation, path);
  return (item && firstNavigablePath(item)) || path;
}

/**
 * Find a navigation item by path and return a specific key value.
 */
export function navKeyFromPath(
  path: string,
  key: string,
  navigation: NavigationItem[] | null | undefined,
): unknown {
  if (!navigation?.length) return undefined;
  return findInNavigation(navigation, path)?.[key];
}

/**
 * Find a navigation directory (children) by path.
 */
export function navDirFromPath(
  path: string,
  navigation: NavigationItem[] | null | undefined,
): NavigationItem[] | null {
  if (!navigation?.length) return null;
  return findInNavigation(navigation, path)?.children ?? null;
}

/**
 * Find a navigation item by path once and extract multiple section keys.
 * Avoids repeated tree traversal for the same path.
 */
export function navPageOverrides(
  path: string,
  keys: readonly string[],
  navigation: NavigationItem[] | null | undefined,
): Record<string, unknown> {
  if (!navigation?.length) return {};

  const found = findInNavigation(navigation, path);
  if (!found) return {};

  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (found[key] !== undefined) {
      result[key] = found[key];
    }
  }
  return result;
}

/**
 * Composable that provides the helper functions.
 * This replaces useContentHelpers() from Nuxt Content v2.
 */
export function useContentHelpers() {
  return {
    navKeyFromPath,
    navDirFromPath,
    navPageOverrides,
  };
}
