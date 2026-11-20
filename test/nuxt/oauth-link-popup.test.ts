import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime';
import { flushPromises } from '@vue/test-utils';
import { expect, it, vi } from 'vitest';
import ConnectedAccountsCard from '#layers/auth-oauth/app/components/settings/ConnectedAccountsCard.vue';
import { oauthRoutes } from '#layers/auth-oauth/shared/oauthRoutes';
import { authRoutes } from '#layers/auth/shared/authRoutes';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('#layers/server-core/app/utils/apiRequest', () => ({ apiRequest }));

function completePopup(path: string, params: Record<string, string>) {
  const target = new URL(path, window.location.origin);
  target.search = new URLSearchParams(params).toString();
  window.dispatchEvent(new MessageEvent('message', {
    origin: window.location.origin,
    data: { type: 'oauth:complete', url: target.href },
  }));
  return flushPromises();
}

it('links back to settings, refreshes on success, and shows conflict and provider errors', async () => {
  registerEndpoint(oauthRoutes.PROVIDERS, () => ({ success: true, data: ['google'] }));
  const accounts = vi.fn(() => ({ success: true, data: [] }));
  apiRequest.mockImplementation(async (path: string) => {
    if (path === oauthRoutes.ACCOUNTS) return accounts();
    if (path === oauthRoutes.URL) return { success: true, data: { url: oauthRoutes.provider('google') } };
    throw new Error(`Unexpected API request: ${path}`);
  });
  const popup = { closed: false, location: { replace: vi.fn() }, focus: vi.fn(), close: vi.fn() };
  vi.stubGlobal('open', vi.fn(() => popup));
  const refresh = vi.fn(async () => {});
  const wrapper = await mountSuspended(ConnectedAccountsCard, {
    props: {
      profile: {
        id: 1, username: 'member', name: 'Member', email: 'member@example.test', emailVerified: true,
        isAdmin: false, createdAt: new Date(), lastLoginAt: new Date(), signInMethods: { password: 1 },
      },
      refresh,
    },
    global: { stubs: { 'motion.div': { template: '<div><slot /></div>' } } },
  });
  try {
    const link = 'button[aria-label="Link Google account"]';
    await vi.waitFor(() => expect(wrapper.get(link).attributes('disabled')).toBeUndefined());
    await wrapper.get(link).trigger('click');
    await vi.waitFor(() => expect(popup.location.replace).toHaveBeenCalledTimes(1));
    expect(apiRequest).toHaveBeenCalledWith(oauthRoutes.URL, {
      method: 'POST',
      body: { action: 'link', provider: 'google', redirectTo: authRoutes.SETTINGS_SECURITY },
    });
    await completePopup(authRoutes.SETTINGS_SECURITY, { provider: 'google', success: 'oauth-linked' });
    expect(wrapper.text()).toContain('Account connected');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(accounts).toHaveBeenCalledTimes(2);

    await wrapper.get(link).trigger('click');
    await vi.waitFor(() => expect(popup.location.replace).toHaveBeenCalledTimes(2));
    await completePopup(authRoutes.SETTINGS_SECURITY, { provider: 'google', error: 'oauth-already-linked' });
    expect(wrapper.text()).toContain('This provider account is already linked to another user.');
    expect(refresh).toHaveBeenCalledTimes(1);

    await wrapper.get(link).trigger('click');
    await vi.waitFor(() => expect(popup.location.replace).toHaveBeenCalledTimes(3));
    await completePopup(authRoutes.AUTH_LOGIN, { error: 'oauth-error' });
    expect(wrapper.text()).toContain('Couldn’t connect the account. Please try again.');
  } finally {
    wrapper.unmount();
    vi.unstubAllGlobals();
  }
});
