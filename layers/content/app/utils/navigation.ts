import type { NavigationBadge, NavigationItem } from '#layers/content/types';

const BADGE_VARIANTS = [
  'default',
  'secondary',
  'destructive',
  'success',
  'warning',
  'outline',
] satisfies NonNullable<NavigationBadge['variant']>[];

/** Narrows arbitrary frontmatter to a variant the Badge component accepts. */
export function badgeVariant(value: unknown): NavigationBadge['variant'] {
  return BADGE_VARIANTS.find((variant) => variant === value);
}

function text(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Badges declared on a navigation entry. Navigation nodes carry arbitrary
 * frontmatter under an `unknown` index signature, so the shape is checked here
 * rather than assumed at each template that renders them.
 */
export function navigationBadges(item?: NavigationItem | null): NavigationBadge[] {
  const badges = item?.navBadges;
  if (!Array.isArray(badges)) return [];

  return badges.flatMap((badge) => {
    if (typeof badge !== 'object' || badge === null || Array.isArray(badge)) return [];
    const source: Record<string, unknown> = { ...badge };
    const value = text(source, 'value');
    if (value === undefined) return [];
    return [
      {
        value,
        variant: badgeVariant(source.variant),
        type: text(source, 'type'),
        size: text(source, 'size'),
      },
    ];
  });
}

/**
 * Pages in reading order, as @nuxt/content's `flattedData` (internal/surround.js)
 * orders them: a folder counts as a page unless it is `page: false` or one of its
 * children shares its path.
 */
function flattenPages<T extends { path: string; page?: unknown; children?: T[] }>(items: T[]): T[] {
  return items.flatMap((item) => {
    const children = item.children ? flattenPages(item.children) : [];
    if (item.page === false || children.some((child) => child.path === item.path)) {
      return children;
    }
    return [{ ...item, children: undefined }, ...children];
  });
}

/**
 * [previous, next] neighbours of `path` in an already-loaded navigation tree.
 * Same result as `queryCollectionItemSurroundings(collection, path)` with the
 * same fields, without querying and rebuilding the tree again.
 */
export function findSurroundings<T extends { path: string; page?: unknown; children?: T[] }>(
  navigation: T[],
  path: string,
): [T | null, T | null] {
  const pages = flattenPages(navigation);
  const normalizedPath = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  const index = pages.findIndex((item) => item.path === normalizedPath);
  if (index === -1) return [null, null];
  return [pages[index - 1] ?? null, pages[index + 1] ?? null];
}

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

export { findPageBreadcrumbs } from '~/utils/breadcrumbs';
export type { PageBreadcrumbItem } from '~~/types';
