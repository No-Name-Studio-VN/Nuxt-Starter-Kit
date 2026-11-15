import type { ContentNavigationItem, ContentCollectionItem } from '@nuxt/content';
import type { NuxtApp } from '#app';

interface DocsSharedState {
  page: ShallowRef<ContentCollectionItem | null>;
  navigation: ShallowRef<ContentNavigationItem[] | null>;
  /** [previous, next]; either side is null at the ends of the tree. */
  surroundings: ShallowRef<(ContentNavigationItem | null)[] | null>;
}

// One store per NuxtApp: per request on the server, a singleton in the browser.
const docsState = new WeakMap<NuxtApp, DocsSharedState>();

/**
 * Shared data store for page content, navigation, and surroundings.
 *
 * This composable does NOT fetch data — it only provides shared reactive state.
 * Each [...slug].vue instance fetches its own content with useDocsPageContent and
 * publishes it here; the docs layout seeds it once so SSR renders the right shell.
 * All other consumers (layout, sidebar, breadcrumb, toc, etc.) read from here.
 *
 * Deliberately not useState: the values already ship in the asyncData payload
 * (_payload.json), and useState would serialize the same page body and navigation
 * tree a second time inline in every prerendered HTML file. The writers repopulate
 * it from asyncData in setup, in the same order on the server and during hydration.
 */
export function usePageData(): DocsSharedState {
  const nuxtApp = useNuxtApp();
  let state = docsState.get(nuxtApp);
  if (!state) {
    state = {
      page: shallowRef(null),
      navigation: shallowRef(null),
      surroundings: shallowRef(null),
    };
    docsState.set(nuxtApp, state);
  }
  return state;
}

async function fetchDocsPage(path: string) {
  const data = await queryCollection('content').path(path).first();
  // Retry without the trailing slash only when there is one to strip.
  if (!data && path.length > 1 && path.endsWith('/')) {
    return await queryCollection('content').path(path.slice(0, -1)).first();
  }
  return data;
}

/**
 * Content for one docs path. The key is fixed per path, so the layout and the
 * page share a single request and payload entry for the same URL.
 */
export function useDocsPageContent(path: string) {
  return useAsyncData(`docs-page:${path}`, () => fetchDocsPage(path));
}
