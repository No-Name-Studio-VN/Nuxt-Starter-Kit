import type { ContentNavigationItem, ContentCollectionItem } from '@nuxt/content';

/**
 * Shared data store for page content, navigation, and surroundings.
 *
 * This composable does NOT fetch data — it only provides shared reactive state.
 * Page content is populated by the docs layout before SSR renders the shell;
 * navigation and surroundings are populated by [...slug].vue via useAsyncData,
 * and all other consumers (layout, sidebar, breadcrumb, toc, etc.) read from here.
 */
export function usePageData() {
  const page = useState<ContentCollectionItem | null>('docs-page', () => null);
  const navigation = useState<ContentNavigationItem[] | null>('docs-navigation', () => null);
  const surroundings = useState<ContentNavigationItem[] | null>('docs-surroundings', () => null);

  return { page, navigation, surroundings };
}
