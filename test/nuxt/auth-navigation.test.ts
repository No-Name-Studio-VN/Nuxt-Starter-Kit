import { mountSuspended } from '@nuxt/test-utils/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { useUserSession } from '#imports';
import ExtensionSlot from '@/components/ExtensionSlot.vue';
import LoginPage from '#layers/auth/app/pages/auth/login.vue';
import { LAST_SIGN_IN_KEY } from '#layers/auth/app/utils/lastSignIn';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { getExtensions } from '@/utils/extensions';
import type * as MotionVue from 'motion-v';

vi.mock('motion-v', async (importOriginal) => {
  const original = await importOriginal<typeof MotionVue>();
  const { defineComponent, h } = await import('vue');
  const Motion = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  const motion = new Proxy(original.motion, {
    get(target, key, receiver) {
      return key === 'div' ? Motion : Reflect.get(target, key, receiver);
    },
  });
  return { ...original, Motion, motion };
});

function remember(name: string, key = LAST_SIGN_IN_KEY) {
  localStorage.setItem(
    key,
    JSON.stringify({
      name,
      method: 'password',
      username: 'member',
      avatar: null,
      avatarUrl: null,
      savedAt: 1,
    }),
  );
  window.dispatchEvent(new StorageEvent('storage', { key, storageArea: localStorage }));
  return nextTick();
}

afterEach(() => localStorage.clear());

describe('auth navigation', () => {
  it('contributes the signed-in account menu only to the default header', async () => {
    const wrapper = await mountSuspended(
      defineComponent({
        setup() {
          const { session } = useUserSession();
          session.value = {
            user: {
              id: 1,
              username: 'member',
              name: 'Member',
              isAdmin: false,
              onboardingPending: false,
            },
          };
          return () => h(ExtensionSlot, { name: 'header:actions' });
        },
      }),
      { attachTo: document.body },
    );
    try {
      const trigger = wrapper.get('button[aria-haspopup="menu"]');
      await trigger.trigger('keydown', { key: 'ArrowDown' });
      expect(document.body.querySelector('a[role="menuitem"]')?.getAttribute('href')).toBe(
        authRoutes.SETTINGS_PROFILE,
      );
      expect(document.body.querySelector('[role="menu"]')?.textContent).toContain('Log out');
      expect(getExtensions('dashboard:header:actions').map(({ id }) => id)).not.toContain(
        'auth-account',
      );
    } finally {
      wrapper.unmount();
    }
  });

  it('updates the remembered account only in response to its local-storage key', async () => {
    await remember('First account');
    const wrapper = await mountSuspended(LoginPage, {
      global: {
        stubs: {
          AuthPageLayout: { template: '<div><slot /></div>' },
          ExtensionSlot: true,
          RememberedPasswordSignIn: { props: ['record'], template: '<p>{{ record.name }}</p>' },
        },
      },
    });
    try {
      expect(wrapper.text()).toContain('First account');
      await remember('Second account');
      expect(wrapper.text()).toContain('Second account');
      expect(wrapper.text()).not.toContain('First account');
      localStorage.removeItem(LAST_SIGN_IN_KEY);
      await remember('Unrelated account', 'unrelated');
      expect(wrapper.text()).toContain('Second account');
      window.dispatchEvent(
        new StorageEvent('storage', { key: LAST_SIGN_IN_KEY, storageArea: localStorage }),
      );
      await nextTick();
      expect(wrapper.text()).not.toContain('Second account');
    } finally {
      wrapper.unmount();
    }
  });
});
