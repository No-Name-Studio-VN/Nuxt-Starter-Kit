import { onBeforeUnmount, onMounted, readonly, shallowRef } from 'vue';
import { oauthRoutes } from '#layers/auth-oauth/shared/oauthRoutes';
import type { OAuthProviderId } from '#layers/auth-oauth/types/providers';
import type { OAuthUrlPayload } from '#layers/auth-oauth/types/oauth';
import type { OAuthPopupAttempt, OAuthPopupOptions } from '#layers/auth-oauth/types/oauthPopup';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import type { ApiResponse } from '#layers/server-core/types/api';
import { watchOAuthPopupClosed } from '../utils/watchOAuthPopupClosed';
import { useOAuthPopupListener } from './useOAuthPopupListener';

const OAUTH_POPUP_TIMEOUT = 120_000;

export function useOAuthPopup(options: OAuthPopupOptions) {
  const activeProvider = shallowRef<string>();
  let attempt: OAuthPopupAttempt | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let stopWatching: (() => void) | undefined;

  function clearPopup() {
    stopWatching?.();
    stopWatching = undefined;
    clearTimeout(timeout);
    timeout = undefined;
    activeProvider.value = undefined;
  }

  function cancel() {
    const popup = attempt?.popup;
    attempt = undefined;
    clearPopup();
    popup?.close();
  }

  const listener = useOAuthPopupListener(({ url }) => {
    if (!attempt?.completionDeadline || Date.now() > attempt.completionDeadline) return;

    let target: URL;
    try {
      target = new URL(url);
      if (target.origin !== window.location.origin || target.protocol !== window.location.protocol || target.pathname.startsWith('//')) {
        throw new Error('Unexpected OAuth callback URL');
      }
    } catch {
      if (options.action !== 'link') {
        cancel();
        options.onError?.(new Error('auth_oauth.invalid_response'));
      }
      return;
    }

    if (options.onComplete) {
      if (options.onComplete(target, attempt.provider)) cancel();
    } else {
      cancel();
      window.location.assign(target.href);
    }
  });

  async function open(provider: OAuthProviderId, redirectTo?: string) {
    if (activeProvider.value) return;
    cancel();

    const width = Math.max(1, Math.min(560, window.outerWidth - 40));
    const height = Math.max(1, Math.min(720, window.outerHeight - 80));
    const left = window.screenX + Math.max(0, (window.outerWidth - width) / 2);
    const top = window.screenY + Math.max(0, (window.outerHeight - height) / 2);
    const popup = window.open('about:blank', `oauth-${provider}`,
      `popup,width=${width},height=${height},left=${left},top=${top}`);
    if (!popup) {
      options.onBlocked?.();
      return;
    }

    const current: OAuthPopupAttempt = { provider, popup };
    attempt = current;
    activeProvider.value = provider;
    stopWatching = watchOAuthPopupClosed(popup, () => {
      // Cross-origin isolation can look like a closed window before its callback reaches us.
      current.popup = null;
      if (!current.completionDeadline) attempt = undefined;
      stopWatching = undefined;
      activeProvider.value = undefined;
      if (!attempt) clearPopup();
    });
    timeout = setTimeout(() => {
      const wasOpen = Boolean(activeProvider.value);
      cancel();
      if (wasOpen) options.onTimeout?.();
    }, OAUTH_POPUP_TIMEOUT);

    try {
      const response = await apiRequest<ApiResponse<OAuthUrlPayload>>(oauthRoutes.URL, {
        method: 'POST',
        body: { provider, action: options.action ?? 'login', redirectTo },
      });
      if (attempt !== current) return;
      if (!response.success) throw response;
      const url = new URL(response.data.url, window.location.origin);
      if (popup.closed) {
        cancel();
        return;
      }
      if (url.origin !== window.location.origin || url.protocol !== window.location.protocol ||
        url.pathname !== oauthRoutes.provider(provider)) {
        throw new Error('auth_oauth.invalid_response');
      }
      current.completionDeadline = Date.now() + OAUTH_POPUP_TIMEOUT;
      popup.location.replace(url.href);
      popup.focus();
    } catch (error) {
      if (attempt !== current) return;
      cancel();
      options.onError?.(error);
    }
  }

  onMounted(listener.start);
  onBeforeUnmount(() => {
    listener.stop();
    cancel();
  });

  return { activeProvider: readonly(activeProvider), open, cancel };
}
