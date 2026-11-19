import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import { oauthRoutes } from '#layers/auth-oauth/shared/oauthRoutes';
import { requireReadyOAuthProvider } from '../../../oauth/requireReadyOAuthProvider';
import type { OAuthUrlPayload } from '#layers/auth-oauth/types/oauth';
import { oauthUrlBodySchema } from '#layers/auth-oauth/shared/schemas/oauthSchema';

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, (body) => oauthUrlBodySchema.safeParse(body));
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Please fix the highlighted fields.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
      cause: result.error,
    });
  }

  const { provider, action, redirectTo } = result.data;

  const definition = requireReadyOAuthProvider(event, provider);
  const params = new URLSearchParams({ popup: '1' });
  if (action === 'link') {
    params.set('action', 'link');
  }
  if (redirectTo) {
    params.set('redirectTo', redirectTo);
  }

  const url = `${oauthRoutes.provider(definition.id)}?${params.toString()}`;
  const response: OAuthUrlPayload = { url };
  return success(response);
});
