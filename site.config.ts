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
    // Empty uses installed modules' menus; entries replace them, e.g. [{ title: 'Members', to: '/members' }].
    nav: [],
    links: [
      {
        icon: 'lucide:github',
        to: 'https://github.com/No-Name-Studio-VN/Homepage',
        target: '_blank',
      },
    ],
  },
  auth: {
    // Keyed by auth page; `default` covers any page without its own entry. Text may be an i18n key.
    quotes: {
      default: {
        text: 'Everything you need to ship, already wired up.',
        author: 'No Name Studio',
      },
      login: {
        text: 'Nuxt Starter Kit is the best way to start your next Nuxt project with all the essential features and integrations you need.',
        author: 'Ngo Duc Manh Le',
      },
      register: {
        text: 'Build a library that feels like yours from the first page.',
        author: 'No Name Studio',
      },
      'forgot-password': {
        text: 'Get back into your library without losing your place.',
        author: 'No Name Studio',
      },
      'reset-password': {
        text: 'Choose a fresh key and step right back into your library.',
        author: 'No Name Studio',
      },
      'verify-email': {
        text: 'Verify your account once, then keep your reading in sync everywhere.',
        author: 'No Name Studio',
      },
    },
  },
};
