import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import oauthAccountService from '#layers/auth/server/utils/database/oauthAccount';
import userService from '#layers/auth/server/utils/database/user';
import type { OAuthUnlinkPayload } from '#layers/auth/types/auth';
import { oauthUnlinkBodySchema } from '#layers/auth/shared/schemas/userSchema';

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

  // Check if user has a password
  const dbUser = await userService.getById(userId);
  if (!dbUser) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'User not found.',
      code: 'USER_NOT_FOUND',
    });
  }

  const hasPassword = !!dbUser.password && dbUser.password.trim().length > 0;

  // Count other linked providers
  const linkedCount = await oauthAccountService.countByUserId(userId);

  // User must have at least one other auth method (password or another provider)
  if (!hasPassword && linkedCount <= 1) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: "You can't unlink your only sign-in method. Set a password first.",
      code: 'ONLY_SIGNIN_METHOD',
    });
  }

  // Unlink the provider
  await oauthAccountService.unlink(userId, provider);

  const response: OAuthUnlinkPayload = {
    unlinked: true,
  };

  return success(response);
});
