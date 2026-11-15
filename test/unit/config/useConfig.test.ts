import { createRequire } from 'node:module';
import { computed } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiteConfig } from '~~/types';

// Unit tests do not use Nuxt's Vite resolver for its transitive dependencies.
const nuxtRequire = createRequire(import.meta.resolve('nuxt'));
vi.mock('defu', () => import(nuxtRequire.resolve('defu')));

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function createConfig(nav: SiteConfig['header']['nav'] = []) {
  const { getNavItems, registerNavItem } = await import('../../../app/utils/extensions');
  registerNavItem('header', {
    id: 'blog',
    order: 20,
    labelKey: 'nav.blog',
    to: '/blogs',
  });
  registerNavItem('header', {
    id: 'docs',
    order: 10,
    labelKey: 'nav.docs',
    to: '/docs',
    links: [
      {
        labelKey: 'Guide',
        to: '/docs/guide',
        descriptionKey: 'Read the guide',
        icon: 'lucide:book',
        target: '_self',
      },
    ],
  });
  vi.stubGlobal('computed', computed);
  vi.stubGlobal('getNavItems', getNavItems);
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { site: { header: { nav } } } }));
  const { useConfig } = await import('../../../app/composables/useConfig');
  return { config: useConfig(), registerNavItem };
}

describe('header navigation', () => {
  it('uses ordered layer items when the project menu is empty', async () => {
    const { config } = await createConfig();
    expect(config.value.header.nav.map((item) => item.title)).toEqual(['nav.docs', 'nav.blog']);
    expect(config.value.header.nav[0]?.links).toEqual([
      {
        title: 'Guide',
        to: '/docs/guide',
        description: 'Read the guide',
        icon: 'lucide:book',
        target: '_self',
      },
    ]);
  });

  it('replaces all layer items with the non-empty project menu, including dropdowns', async () => {
    const nav: SiteConfig['header']['nav'] = [
      {
        title: 'Members',
        to: '/members',
        links: [{ title: 'Our team', to: '/members/team', description: 'Meet the team' }],
      },
      { title: 'nav.blog', to: '/blogs' },
    ];
    const { config, registerNavItem } = await createConfig(nav);
    registerNavItem('header', { id: 'extra', order: 30, labelKey: 'Extra', to: '/extra' });
    expect(config.value.header.nav).toEqual(nav);
  });

  it('reacts to layer registrations when there is no project override', async () => {
    const { config, registerNavItem } = await createConfig();
    expect(config.value.header.nav).toHaveLength(2);
    registerNavItem('header', { id: 'extra', order: 30, labelKey: 'Extra', to: '/extra' });
    expect(config.value.header.nav.map((item) => item.title)).toEqual([
      'nav.docs',
      'nav.blog',
      'Extra',
    ]);
  });
});
