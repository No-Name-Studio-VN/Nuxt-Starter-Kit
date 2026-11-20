import type { NuxtApp } from '#app';
import { stripContentLocalePrefix } from '../utils/contentPaths';
import type { DocsPageContent, DocsSharedState } from '#layers/content/types/docs-data';

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

async function queryDocsPage(nuxtApp: NuxtApp, path: string) {
  const findPage = (candidate: string) =>
    nuxtApp.runWithContext(() => queryCollection('content').path(candidate).first());
  const page = await findPage(path);
  const withoutTrailingSlash = path.replace(/\/+$/, '') || '/';
  if (!page && withoutTrailingSlash !== path) {
    return await findPage(withoutTrailingSlash);
  }
  return page;
}

async function fetchDocsPage(
  nuxtApp: NuxtApp,
  path: string,
  locale: string,
  defaultLocale: string,
): Promise<DocsPageContent | null> {
  const page = await queryDocsPage(nuxtApp, path);
  if (page) return { page, isFallback: false };

  const fallbackPath = stripContentLocalePrefix(path, locale);
  if (locale === defaultLocale || fallbackPath === path || fallbackPath === '/') return null;

  const fallbackPage = await queryDocsPage(nuxtApp, fallbackPath);
  return fallbackPage ? { page: fallbackPage, isFallback: true } : null;
}

/**
 * Content for one docs path. The key is fixed per path, so the layout and the
 * page share a single request and payload entry for the same URL.
 */
export function useDocsPageContent(path: string) {
  const { locale, defaultLocale } = useI18n();
  const requestedLocale = locale.value;
  return useAsyncData(`docs-page:${path}`, (nuxtApp) =>
    fetchDocsPage(nuxtApp, path, requestedLocale, defaultLocale),
  );
}

export function useDocsNavigation() {
  return useAsyncData('navigation', () =>
    queryCollectionNavigation('content', ['title', 'description', 'path', 'icon', 'navBadges']),
  );
}
