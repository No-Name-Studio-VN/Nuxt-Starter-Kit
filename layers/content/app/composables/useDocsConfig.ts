import { createDefu } from 'defu';
import type { DocsConfig, NavigationItem } from '#layers/content/types';
import { navPageOverrides } from './useContentHelpers';
import { usePageData } from './usePageData';
import { APP_MANIFEST } from '#shared/constants/manifest';

const customDefu = createDefu((obj, key, value) => {
  if (Array.isArray(value) && value.every((x: unknown) => typeof x === 'string')) {
    obj[key] = value;
    return true;
  }
});

/**
 * Merges the published overrides over the defaults, stating the result type.
 *
 * `defu` describes a merge of two arbitrary shapes, so it widens every merged
 * section to a union with `{}` — correct in general, useless here, where
 * `defaultConfig` supplies every key. Left unstated, that union makes each
 * section's properties unreachable at the ~60 places that read the config.
 *
 * Layering the merge back over `defaults` is what carries the type across: the
 * result is `DocsConfig` intersected with whatever `defu` inferred, rather
 * than an assertion that it is one. The overrides cannot be typed as
 * `DocsConfig` themselves because Nuxt generates their type from the
 * committed value, which widens every literal union — `ogImageColor` arrives as
 * `string`, not `'dark' | 'light'`.
 */
function mergeConfig(defaults: DocsConfig, overrides: object): DocsConfig {
  return Object.assign({}, defaults, customDefu(overrides, defaults));
}

/** Spreadable view of a navigation or frontmatter override, which may be anything. */
function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : {};
}

/** Config sections that support per-page overrides via navigation and frontmatter. */
const OVERRIDE_SECTIONS = ['header', 'banner', 'main', 'aside', 'toc', 'footer'] satisfies readonly (keyof DocsConfig)[];

const defaultConfig: DocsConfig = {
  site: {
    name: APP_MANIFEST.name,
    description: APP_MANIFEST.description,
    ogImage: '/hero.png',
    ogImageComponent: 'OgImageDocs',
    ogImageColor: 'light',
    umami: {
      enable: false,
      src: 'https://cloud.umami.is/script.js',
      dataWebsiteId: '',
    },
  },
  theme: {
    customizable: true,
    color: 'zinc',
    radius: 0.5,
  },
  banner: {
    enable: false,
    showClose: true,
    content: `Welcome to **${APP_MANIFEST.name}**`,
    to: '',
    target: '_blank',
    border: true,
  },
  header: {
    showLoadingIndicator: true,
    title: APP_MANIFEST.short_name,
    showTitle: true,
    logo: {
      light: '/favicon.svg',
      dark: '/favicon.svg',
    },
    showTitleInMobile: false,
    border: false,
    darkModeToggle: true,
    languageSwitcher: {
      enable: true,
      triggerType: 'icon',
      dropdownType: 'select',
    },
    nav: [],
    links: [],
  },
  aside: {
    useLevel: true,
    levelStyle: 'aside',
    headerLevelNavAlign: 'start',
    collapse: false,
    collapseLevel: 1,
    folderStyle: 'default',
  },
  main: {
    breadCrumb: true,
    showTitle: true,
    codeCopyToast: false,
    codeCopyToastText: 'common.copy.success',
    fieldRequiredText: 'required',
    padded: true,
    editLink: {
      enable: false,
      pattern: '',
      text: 'Edit this page',
      icon: 'lucide:square-pen',
      placement: ['docsFooter'],
    },
    issueLink: {
      enable: false,
      pattern: '',
      text: 'Create an issue',
      icon: 'lucide:circle-dot',
      placement: ['docsFooter'],
    },
    backToTop: true,
    pm: ['npm', 'pnpm', 'bun', 'yarn'],
    imageZoom: true,
  },
  footer: {
    border: true,
    credits: '',
    links: [],
  },
  toc: {
    enable: true,
    enableInMobile: false,
    enableInHomepage: false,
    progressBar: true,
    title: 'docs.toc.title',
    links: [],
    iconLinks: [],
    carbonAds: {
      enable: false,
      disableInDev: false,
      disableInMobile: false,
      fallback: false,
      fallbackMessage: 'errors.adblock',
      code: '',
      placement: '',
      format: 'cover',
    },
  },
  search: {
    enable: true,
    inAside: false,
    style: 'input',
    placeholder: 'search.title',
    placeholderDetailed: 'search.document',
  },
};

export function useDocsConfig() {
  const appConfig = useRuntimeConfig().public.docs;
  const siteConfig = useConfig();

  const route = useRoute();

  const { page, navigation } = usePageData();

  return computed<DocsConfig>(() => {
    const processedConfig = mergeConfig(defaultConfig, customDefu(appConfig, siteConfig.value));

    const navOverrides = navPageOverrides(route.path, OVERRIDE_SECTIONS, navigation.value);
    const pageData: Record<string, unknown> = { ...page.value };

    const sectionOverrides: Record<string, unknown> = {};
    for (const key of OVERRIDE_SECTIONS) {
      sectionOverrides[key] = {
        ...processedConfig[key],
        ...toRecord(navOverrides[key]),
        ...toRecord(pageData?.[key]),
      };
    }

    // Same reasoning as `mergeConfig`: the per-page overrides are untyped
    // frontmatter, so the typed config goes in first and keeps the shape.
    return Object.assign({}, processedConfig, sectionOverrides);
  });
}
