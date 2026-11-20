import type { RequestEvent } from 'nuxt/server';
import {
  defineEventHandler,
  deleteCookie,
  getRequestURL,
  getRouterParam,
  setCookie,
} from 'nuxt/server';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { apiError } from '#layers/server-core/server/utils/apiResponse';
import { handleOAuthSuccess, sendOAuthRedirect } from '#layers/auth/server/utils/oauth';
import { getOAuthProvider } from '#layers/auth/server/utils/oauthProviders';
import { safeRedirectPath } from '#layers/auth/server/utils/safeRedirect';

function rememberPopupOAuthRequest(event: RequestEvent) {
  const { searchParams } = getRequestURL(event);
  if (searchParams.get('popup') !== '1') {
    return;
  }

  const redirectTo = searchParams.get('redirectTo');

  setCookie(event, 'oauth_popup', '1', {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    maxAge: 600,
  });
  deleteCookie(event, 'oauth_redirect_to', { path: '/' });

  if (redirectTo) {
    setCookie(event, 'oauth_redirect_to', safeRedirectPath(event, redirectTo), {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 600,
    });
  }
}

export default defineEventHandler(async (event) => {
  const providerId = getRouterParam(event, 'provider') || '';
  const provider = getOAuthProvider(providerId, useRuntimeConfig());
  if (!provider) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: `OAuth provider '${providerId}' is not supported.`,
      code: 'OAUTH_PROVIDER_ERROR',
    });
  }

  rememberPopupOAuthRequest(event);

  const handler = provider.createHandler(
    async (event, profile) => handleOAuthSuccess(event, providerId, profile),
    async (event, error) => {
      // Provider errors can carry callback parameters or token responses in data.
      console.error(`[${provider.name} OAuth] Error:`, {
        status: error.status,
        ...(error.data === undefined ? { message: error.message } : {}),
      });
      return sendOAuthRedirect(event, `${authRoutes.AUTH_LOGIN}?error=oauth-error`);
    },
  );
  return handler(event);
});
