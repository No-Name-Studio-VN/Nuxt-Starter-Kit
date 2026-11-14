import { createDefu } from 'defu';
import type { SiteConfig } from '~~/types';
import { APP_MANIFEST } from '#shared/constants/manifest';

const customDefu = createDefu((obj, key, value) => {
  if (Array.isArray(value) && value.every((item: unknown) => typeof item === 'string')) {
    obj[key] = value;
    return true;
  }
});

const defaultConfig: SiteConfig = {
  site: {
    name: APP_MANIFEST.name,
    description: APP_MANIFEST.description,
    ogImage: '/hero.png',
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
};

export function useConfig() {
  const appConfig = useRuntimeConfig().public.site;
  return computed<SiteConfig>(() => {
    const config = Object.assign({}, defaultConfig, customDefu(appConfig, defaultConfig));
    return {
      ...config,
      header: {
        ...config.header,
        nav: [
          ...config.header.nav,
          ...getNavItems('header').map((item) => ({
            title: item.labelKey,
            to: item.to,
            target: item.target,
            showLinkIcon: item.showLinkIcon,
            links: item.links?.map((link) => ({
              title: link.labelKey,
              to: link.to,
              target: link.target,
              description: link.descriptionKey,
              icon: link.icon,
            })),
          })),
        ],
      },
    };
  });
}
