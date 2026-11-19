import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import oauthAccountService from '#layers/auth-oauth/server/utils/database/oauthAccount';
import { assertCanRemoveCredential } from '#layers/auth/server/utils/signInMethods';
import type { OAuthUnlinkPayload } from '#layers/auth-oauth/types/oauth';
import { oauthUnlinkBodySchema } from '#layers/auth-oauth/shared/schemas/oauthSchema';
import { getOAuthReadiness } from '../../../oauth/readiness';

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event);
  const result = await readValidatedBody(event, (body) => oauthUnlinkBodySchema.safeParse(body));
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

  // Verify this provider is actually linked
  const linkedAccount = await oauthAccountService.getByUserAndProvider(userId, provider);
  if (!linkedAccount) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'This provider is not linked to your account.',
      code: 'OAUTH_PROVIDER_NOT_LINKED',
    });
  }

  const { ready } = getOAuthReadiness(useRuntimeConfig(event));
  if (ready.includes(provider)) {
    await assertCanRemoveCredential(userId);
  }

  // Unlink the provider
  await oauthAccountService.unlink(userId, provider);

  const response: OAuthUnlinkPayload = {
    unlinked: true,
  };

  return success(response);
});
