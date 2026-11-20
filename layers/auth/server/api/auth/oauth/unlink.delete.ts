import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import { readValidatedRequestBody } from '#layers/server-core/server/utils/requestBody';
import oauthAccountService from '#layers/auth/server/utils/database/oauthAccount';
import type { OAuthUnlinkPayload } from '#layers/auth/types/auth';
import { oauthUnlinkBodySchema } from '#layers/auth/shared/schemas/userSchema';

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

  const unlinked = await oauthAccountService.unlink(userId, provider);
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
