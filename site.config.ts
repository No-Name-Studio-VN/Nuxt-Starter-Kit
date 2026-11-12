import { APP_MANIFEST } from './shared/constants/manifest';

export const SITE_CONFIG = {
  site: {
    name: APP_MANIFEST.name,
    description: APP_MANIFEST.description,
    ogImage: '/hero.png',
    umami: {
      enable: true,
      src: 'https://cloud.umami.is/script.js',
      dataWebsiteId: '59f6944e-8a7c-463d-a01c-f5a255b3b26b',
    },
  },
  theme: {
    customizable: false,
    color: 'zinc',
    radius: 0.5,
  },
  header: {
    title: APP_MANIFEST.name,
    showTitle: true,
    logo: {
      light: '/favicon.svg',
      dark: '/favicon.svg',
    },
    border: false,
    darkModeToggle: true,
    languageSwitcher: {
      enable: true,
      triggerType: 'icon',
      dropdownType: 'select',
    },
    nav: [],
    links: [
      {
        icon: 'lucide:github',
        to: 'https://github.com/No-Name-Studio-VN/Homepage',
        target: '_blank',
      },
    ],
  },
};
