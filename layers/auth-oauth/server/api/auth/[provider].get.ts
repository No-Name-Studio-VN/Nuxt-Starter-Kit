import { authRoutes } from '#layers/auth/shared/authRoutes';
import { requireReadyOAuthProvider } from '../../oauth/requireReadyOAuthProvider';
import { handleOAuthSuccess, rememberOAuthRequest, sendOAuthRedirect } from '../../utils/oauth';

export default defineEventHandler(async (event) => {
  const provider = requireReadyOAuthProvider(event, getRouterParam(event, 'provider') ?? '');
  rememberOAuthRequest(event);

  const handler = provider.createHandler({
    async onSuccess(event, profile) {
      await handleOAuthSuccess(event, provider.id, profile);
    },
    async onError(event, error) {
      console.error(`[auth-oauth] ${provider.id}: ${error.statusMessage ?? 'Sign-in failed.'}`);
      await sendOAuthRedirect(event, `${authRoutes.AUTH_LOGIN}?error=oauth-error`);
    },
  });

  return handler(event);
});
