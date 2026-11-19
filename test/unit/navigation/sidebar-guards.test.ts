import { shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerNavGuardContext, registerNavItem, useNavGuardContext } from '@/utils/extensions';
import { getVisibleSidebarContexts } from '#layers/dashboard/app/constants/sidebar';

const firstApp = {};
const secondApp = {};

afterEach(() => vi.unstubAllGlobals());

describe('navigation guards', () => {
  it('sets up only the latest provider for a key and keeps its value local to its app', () => {
    vi.stubGlobal('useNuxtApp', () => firstApp);
    const replaced = vi.fn(() => shallowRef({ reports: true }));
    const flags = shallowRef({ reports: false });
    const setup = vi.fn(() => flags);
    registerNavGuardContext('flags', replaced);
    registerNavGuardContext('flags', setup);
    expect(setup).not.toHaveBeenCalled();

    const context = useNavGuardContext();
    expect(replaced).not.toHaveBeenCalled();
    expect(context.value).toEqual({ flags: { reports: false } });
    flags.value = { reports: true };
    expect(context.value).toEqual({ flags: { reports: true } });

    vi.stubGlobal('useNuxtApp', () => secondApp);
    expect(useNavGuardContext().value).toEqual({});
  });

  it('excludes items beneath denied contexts and sections', () => {
    registerNavItem('sidebar', { kind: 'context', id: 'open', order: 100, match: '/' });
    registerNavItem('sidebar', {
      kind: 'context',
      id: 'restricted',
      order: 200,
      match: '/restricted',
      guard: ({ flags }) => flags?.restricted === true,
    });
    registerNavItem('sidebar', {
      kind: 'section',
      id: 'reports',
      order: 100,
      context: 'open',
      title: 'Reports',
      guard: ({ flags }) => flags?.reports === true,
    });
    registerNavItem('sidebar', {
      kind: 'section',
      id: 'restricted-items',
      order: 100,
      context: 'restricted',
      title: 'Restricted items',
    });
    registerNavItem('sidebar', {
      kind: 'item',
      id: 'reports-home',
      order: 100,
      section: 'reports',
      title: 'Reports home',
      url: '/reports',
    });
    registerNavItem('sidebar', {
      kind: 'item',
      id: 'restricted-home',
      order: 100,
      section: 'restricted-items',
      title: 'Restricted home',
      url: '/restricted',
    });

    const denied = getVisibleSidebarContexts({});
    expect(denied.map((context) => context.id)).toEqual(['open']);
    expect(denied.flatMap((context) => context.sections)).toEqual([]);

    const allowed = getVisibleSidebarContexts({ flags: { restricted: true, reports: true } });
    expect(
      allowed.flatMap((context) =>
        context.sections.flatMap((section) => section.items.map((item) => item.url)),
      ),
    ).toEqual(['/reports', '/restricted']);
  });
});
