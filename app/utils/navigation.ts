import type { NavigationItem } from '~~/types';

export const flattenNavigation = (items?: NavigationItem[]): NavigationItem[] =>
  items?.flatMap((item) => (item.children ? flattenNavigation(item.children) : [item])) || [];

/**
 * Transform navigation data by stripping locale and docs levels
 */
export function transformNavigation(
  data: NavigationItem[],
  isI18nEnabled: boolean,
  locale?: string,
): NavigationItem[] {
  if (isI18nEnabled && locale) {
    // i18n: first strip locale level, then check for docs level
    const localeResult = data.find((item) => item.path === `/${locale}`)?.children || data;
    return localeResult.find((item) => item.path === `/${locale}/docs`)?.children || localeResult;
  } else {
    // non-i18n: strip docs level if exists
    return data.find((item) => item.path === '/docs')?.children || data;
  }
}

export interface PageBreadcrumbItem {
  title: string;
  path: string;
}

/**
 * Find breadcrumb path to a page in the navigation tree
 */
export function findPageBreadcrumbs(
  navigation: NavigationItem[] | undefined,
  path: string,
  currentPath: PageBreadcrumbItem[] = [],
): PageBreadcrumbItem[] | undefined {
  if (!navigation) return undefined;

  for (const item of navigation) {
    const itemPath = [...currentPath, { title: item.title, path: item.path }];

    if (item.path === path) {
      return itemPath;
    }

    if (item.children) {
      const found = findPageBreadcrumbs(item.children, path, itemPath);
      if (found) return found;
    }
  }

  return undefined;
}
