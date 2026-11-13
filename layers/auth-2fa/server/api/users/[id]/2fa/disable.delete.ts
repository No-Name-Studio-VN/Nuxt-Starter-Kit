import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import userLockScreenService from '#layers/auth/server/utils/database/userLockScreen';
import userTwoFactorService from '#layers/auth-2fa/server/utils/database/userTwoFactor';
import userService from '#layers/auth/server/utils/database/user';
import { getAuthorizedUserId } from '#layers/auth/server/utils/authorization';
import type { PasswordUpdatePayload } from '#layers/auth/types/userSecurity';
import { disableTotpSchema } from '#layers/auth-2fa/shared/schemas/twoFactorSchema';

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event);
  const result = await readValidatedBody(event, (body) => disableTotpSchema.safeParse(body));

  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. Invalid format.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  const { password } = result.data;

  const user = await userService.getById(userId);
  if (!user) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'Not Found. User not found.',
      code: 'USER_NOT_FOUND',
    });
  }

  const isPasswordValid = await verifyPassword(user.password, password);
  if (!isPasswordValid) {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Unauthorized. Incorrect password.',
      code: 'INVALID_PASSWORD',
    });
  }

  const now = new Date();

  // Clear the 2FA settings and reset the lock screen's failed-attempt counters
  await userTwoFactorService.update({
    userId,
    secret: null,
    enabled: false,
    backupCodes: null,
  });
  await userLockScreenService.update({
    userId,
    failedAttempts: 0,
    lastFailedAttempt: null,
    lastActivityTime: now,
  });

  const response: PasswordUpdatePayload = {
    message: 'Two-Factor Authentication disabled successfully',
  };
  return success(response);
});
