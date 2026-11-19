import { oauthRoutes } from '#layers/auth-oauth/shared/oauthRoutes';
import type { OAuthPopupCompleteMessage } from '#layers/auth-oauth/types/oauth';

export default defineNuxtPlugin(() => {
  if (!window.opener || !window.name.startsWith('oauth-')) {
    return;
  }

  const currentUrl = new URL(window.location.href);
  const redirectTo =
    currentUrl.pathname === oauthRoutes.POPUP ? currentUrl.searchParams.get('redirectTo') : null;
  const payload: OAuthPopupCompleteMessage = {
    type: 'oauth:complete',
    url: redirectTo ? new URL(redirectTo, window.location.origin).href : currentUrl.href,
  };

  try {
    window.opener.postMessage(payload, window.location.origin);
  } catch {
    return;
  }

  window.close();
});
