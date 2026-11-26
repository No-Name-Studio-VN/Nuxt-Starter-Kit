import { defaultLocale } from '../../../../i18n-constants';
import { APP_MANIFEST as SITE_IDENTITY } from '../../../../shared/constants/manifest';
import en from '../../../../i18n/locales/en.json';
import vi from '../../../../i18n/locales/vi.json';
import pwaEn from '../../i18n/locales/en.json';
import pwaVi from '../../i18n/locales/vi.json';
import type { PwaManifest } from '../../types/manifest';

const messages = { en, vi }[defaultLocale];
const pwaMessages = { en: pwaEn, vi: pwaVi }[defaultLocale];

export const APP_MANIFEST: PwaManifest = {
  ...SITE_IDENTITY,
  description: messages.home.description,
  start_url: '/pwa',
  display: 'standalone',
  display_override: ['window-controls-overlay', 'standalone'],
  background_color: '#ffffff',
  theme_color: '#8b5cf6',
  dir: 'ltr',
  lang: defaultLocale,
  orientation: 'any',
  scope: '/',
  categories: ['education', 'productivity', 'technology', 'business'],
  iarc_rating_id: '',
  icons: [
    {
      src: 'pwa-64x64.png',
      sizes: '64x64',
      type: 'image/png',
    },
    {
      src: 'pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
    },
    {
      src: 'pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: 'maskable-icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
  screenshots: [
    {
      src: 'pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      form_factor: 'wide',
    },
    {
      src: 'pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      form_factor: 'narrow',
    },
  ],
  shortcuts: [
    {
      name: messages.common.home,
      short_name: messages.common.home,
      description: pwaMessages.pwa.home_shortcut_description,
      url: '/',
      icons: [
        {
          src: 'pwa-192x192.png',
          sizes: '192x192',
          type: 'image/png',
        },
      ],
    },
  ],
  scope_extensions: [
    {
      origin: '*',
    },
  ],
};
