import type { NavigationItem, PageBreadcrumbItem } from '~~/types';

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
