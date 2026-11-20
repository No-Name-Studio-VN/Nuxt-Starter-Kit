import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import { getOAuthProvider } from '#layers/auth/server/utils/oauthProviders';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import type { OAuthUrlPayload } from '#layers/auth/types/auth';
import { oauthUrlBodySchema } from '#layers/auth/shared/schemas/userSchema';

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

  if (!getOAuthProvider(provider, useRuntimeConfig())) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Unsupported OAuth provider',
      code: 'UNSUPPORTED_OAUTH_PROVIDER',
    });
  }

  const params = new URLSearchParams({ popup: '1' });
  if (action === 'link') {
    params.set('action', 'link');
  }
  if (redirectTo) {
    params.set('redirectTo', redirectTo);
  }

  const url = `${authRoutes.oauthProvider(provider)}?${params.toString()}`;
  const response: OAuthUrlPayload = { url };
  return success(response);
});
