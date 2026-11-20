// @vitest-environment happy-dom
import { createApp, h } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOAuthPopup } from '../../../layers/auth/app/composables/useOAuthPopup';
import { watchOAuthPopupClosed } from '../../../layers/auth/app/utils/watchOAuthPopupClosed';
import type { OAuthPopupOptions } from '../../../layers/auth/types/oauthPopup';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('../../../layers/server-core/app/utils/apiRequest', () => ({ apiRequest }));

const urlResponse = {
  success: true,
  data: { url: '/api/auth/github' },
  timestamp: '2026-11-20T12:00:00.000Z',
};
let unmount: (() => void) | undefined;

afterEach(() => {
  apiRequest.mockReset();
  unmount?.();
  unmount = undefined;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function mountPopup(options: OAuthPopupOptions) {
  let controller: ReturnType<typeof useOAuthPopup> | undefined;
  const app = createApp({
    setup() {
      controller = useOAuthPopup(options);
      return () => h('div');
    },
  });
  app.mount(document.createElement('div'));
  unmount = () => app.unmount();
  if (!controller) throw new Error('Popup controller was not initialized');
  return controller;
}

function mockPopup() {
  const popup = {
    closed: false,
    location: { replace: vi.fn() },
    focus: vi.fn(),
    close: vi.fn(),
  };
  const open = vi.fn(() => popup);
  apiRequest.mockResolvedValue(urlResponse);
  vi.stubGlobal('open', open);
  return { open, popup };
}

function dispatchCompletion(url: string) {
  window.dispatchEvent(new MessageEvent('message', {
    origin: window.location.origin,
    data: { type: 'oauth:complete', url },
  }));
}

describe('OAuth popup lifecycle', () => {
  it('opens a blank popup before waiting for its destination', async () => {
    const { open, popup } = mockPopup();
    const oauth = mountPopup({ onComplete: () => true });
    const response = Promise.withResolvers<typeof urlResponse>();
    apiRequest.mockReturnValue(response.promise);
    const pending = oauth.open('github', '/dashboard');

    expect(open).toHaveBeenCalledWith('about:blank', 'oauth-github', expect.any(String));
    expect(oauth.activeProvider.value).toBe('github');
    expect(popup.location.replace).not.toHaveBeenCalled();
    expect(apiRequest).toHaveBeenCalledWith('/api/auth/oauth/url', {
      method: 'POST',
      body: { provider: 'github', action: 'login', redirectTo: '/dashboard' },
    });
    response.resolve(urlResponse);
    await pending;
    expect(popup.location.replace).toHaveBeenCalledWith(`${window.location.origin}/api/auth/github`);
  });

  it('clears busy state when isolated but still accepts one valid completion before its deadline', async () => {
    vi.useFakeTimers();
    const { popup } = mockPopup();
    const onComplete = vi.fn(() => true);
    const oauth = mountPopup({ onComplete });
    await oauth.open('github');
    popup.closed = true;
    vi.advanceTimersByTime(500);
    expect(oauth.activeProvider.value).toBeUndefined();

    const target = `${window.location.origin}/settings/security?success=oauth-linked`;
    dispatchCompletion(target);
    dispatchCompletion(target);
    expect(onComplete).toHaveBeenCalledExactlyOnceWith(new URL(target), 'github');
  });

  it('ignores invalid callbacks and expires an isolated window’s completion deadline', async () => {
    vi.useFakeTimers();
    const { popup } = mockPopup();
    const onComplete = vi.fn(() => true);
    const oauth = mountPopup({ action: 'link', onComplete });
    await oauth.open('github');
    dispatchCompletion('https://example.test/settings/security');
    expect(oauth.activeProvider.value).toBe('github');

    popup.closed = true;
    vi.advanceTimersByTime(120_001);
    dispatchCompletion(`${window.location.origin}/settings/security?success=oauth-linked`);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('closes the popup and discards a pending response on unmount', async () => {
    const { popup } = mockPopup();
    const onComplete = vi.fn(() => true);
    const oauth = mountPopup({ onComplete });
    const response = Promise.withResolvers<typeof urlResponse>();
    apiRequest.mockReturnValue(response.promise);
    const pending = oauth.open('github');

    unmount?.();
    unmount = undefined;
    response.resolve(urlResponse);
    await pending;

    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(popup.location.replace).not.toHaveBeenCalled();
    expect(oauth.activeProvider.value).toBeUndefined();
  });

  it('closes and times out a still-open attempt after two minutes', async () => {
    vi.useFakeTimers();
    const { popup } = mockPopup();
    const onTimeout = vi.fn();
    const onComplete = vi.fn(() => true);
    const oauth = mountPopup({ onComplete, onTimeout });
    await oauth.open('github');

    vi.advanceTimersByTime(120_000);
    expect(popup.close).toHaveBeenCalledTimes(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(oauth.activeProvider.value).toBeUndefined();
    dispatchCompletion(`${window.location.origin}/settings/security`);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not request a destination when opening the popup is blocked', async () => {
    vi.stubGlobal('open', () => null);
    const onBlocked = vi.fn();
    const oauth = mountPopup({ onComplete: () => true, onBlocked });

    await oauth.open('github');
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(apiRequest).not.toHaveBeenCalled();
    expect(oauth.activeProvider.value).toBeUndefined();
  });
});

describe('OAuth popup close monitor', () => {
  it('reports a closed popup once without failing on an inaccessible popup', () => {
    vi.useFakeTimers();
    let closed = false;
    let inaccessible = false;
    const onClosed = vi.fn();
    watchOAuthPopupClosed({
      get closed() {
        if (inaccessible) throw new Error('The popup is inaccessible');
        return closed;
      },
    }, onClosed);

    vi.advanceTimersByTime(500);
    inaccessible = true;
    vi.advanceTimersByTime(500);
    expect(onClosed).not.toHaveBeenCalled();

    inaccessible = false;
    closed = true;
    vi.advanceTimersByTime(1000);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('does not report closure after it is stopped', () => {
    vi.useFakeTimers();
    const popup = { closed: false };
    const onClosed = vi.fn();
    const stop = watchOAuthPopupClosed(popup, onClosed);

    stop();
    popup.closed = true;
    vi.advanceTimersByTime(500);
    expect(onClosed).not.toHaveBeenCalled();
  });
});
