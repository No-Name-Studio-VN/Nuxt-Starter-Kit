import { defineEventHandler, getQuery, getRouterParam } from 'nuxt/server';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { requireReadyOAuthProvider } from '../../oauth/requireReadyOAuthProvider';
import {
  clearOAuthRequest,
  handleOAuthSuccess,
  rememberOAuthRequest,
  sendOAuthRedirect,
} from '../../utils/oauth';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const callback = Object.hasOwn(query, 'code') || Object.hasOwn(query, 'error');
  const errorPath = `${authRoutes.AUTH_LOGIN}?error=oauth-error`;
  if (callback && (Object.hasOwn(query, 'error') || !query.code)) {
    return sendOAuthRedirect(event, errorPath);
  }

  try {
    const provider = requireReadyOAuthProvider(event, getRouterParam(event, 'provider') ?? '');
    if (!callback) rememberOAuthRequest(event);

    const handler = provider.createHandler({
      async onSuccess(event, profile) {
        return handleOAuthSuccess(event, provider.id, profile);
      },
      async onError(event) {
        console.error(`[auth-oauth] ${provider.id}: Sign-in failed.`);
        return sendOAuthRedirect(event, errorPath);
      },
    });

    return await handler(event);
  } catch (error) {
    if (callback) {
      console.error('[auth-oauth] Callback failed.');
      return sendOAuthRedirect(event, errorPath);
    }
    clearOAuthRequest(event);
    throw error;
  }
});
