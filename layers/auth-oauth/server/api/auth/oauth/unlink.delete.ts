import { getOAuthReadiness } from '../../../oauth/readiness';
import { isOAuthProviderId } from '../../../oauth/registry';
import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import { readValidatedRequestBody } from '#layers/server-core/server/utils/requestBody';
import oauthAccountService from '#layers/auth-oauth/server/utils/database/oauthAccount';
import type { OAuthUnlinkPayload } from '#layers/auth-oauth/types/oauth';
import { oauthUnlinkBodySchema } from '#layers/auth-oauth/shared/schemas/oauthSchema';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const result = await readValidatedRequestBody(event, oauthUnlinkBodySchema.safeParse);
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Provider is required.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
      cause: result.error,
    });
  }

  const { provider } = result.data;

  const userId = session.user.id;

  const { ready } = getOAuthReadiness(useRuntimeConfig(event));
  const requireOtherMethod = isOAuthProviderId(provider) && ready.includes(provider);
  const unlinked = await oauthAccountService.unlink(userId, provider, requireOtherMethod);
  if (!unlinked) {
    const linkedAccount = await oauthAccountService.getByUserAndProvider(userId, provider);
    if (!linkedAccount) {
      throw apiError({
        status: 404,
        statusText: 'Not Found',
        message: 'This provider is not linked to your account.',
        code: 'OAUTH_PROVIDER_NOT_LINKED',
      });
    }

    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Add another sign-in method before unlinking this account.',
      code: 'ONLY_SIGNIN_METHOD',
    });
  }

  const response: OAuthUnlinkPayload = {
    unlinked: true,
  };

  return success(response);
});
