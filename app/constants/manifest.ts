import type { ManifestOptions } from 'vite-plugin-pwa'

export const APP_MANIFEST: Partial<ManifestOptions> = {
  name: 'Nuxt Template',
  short_name: 'Nuxt Template',
  description: 'A Nuxt 3 starter template with PWA support',
  start_url: '/pwa',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#8b5cf6',
  orientation: 'any',
  scope: '/',
  lang: 'en',
  categories: ['education', 'productivity'],
  shortcuts: [
    {
      name: 'Dashboard',
      short_name: 'Dashboard',
      description: 'Sample shortcut to dashboard',
      url: '/dashboard',
    },
  ],
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
}

// SEO-related constants
export const SEO_CONFIG = {
  author: 'No Name Studio',
  keywords: 'nuxt, template, pwa, starter, vue, javascript',
  ogImage: '/pwa-512x512.png',
  twitterCard: 'summary_large_image' as const,
  robots: 'index, follow',
  colorScheme: 'light dark',
} as const
