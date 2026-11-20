import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import { getAuthorizedUserId } from '#layers/auth/server/utils/authorization';
import userPasswordService from '#layers/auth-password/server/utils/database/userPassword';
import userService from '#layers/auth/server/utils/database/user';
import userTwoFactorService from '#layers/auth-2fa/server/utils/database/userTwoFactor';
import { generateBackupCodes } from '#layers/auth-2fa/server/utils/backupCodes';
import { regenerateBackupCodesSchema } from '#layers/auth-2fa/shared/schemas/twoFactorSchema';
import type { TwoFactorBackupCodesPayload } from '#layers/auth-2fa/types/twoFactor';

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event);
  setResponseHeader(event, 'Cache-Control', 'private, no-store');
  const result = await readValidatedBody(event, (body) => regenerateBackupCodesSchema.safeParse(body));
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. Invalid format.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  const user = await userService.getById(userId);
  if (!user) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'Not Found. User not found.',
      code: 'USER_NOT_FOUND',
    });
  }
  if (!(await userPasswordService.verify(userId, result.data.password))) {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Unauthorized. Incorrect password.',
      code: 'INVALID_PASSWORD',
    });
  }

  const twoFactor = await userTwoFactorService.getById(userId);
  if (!twoFactor?.enabled || !twoFactor.secret) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: '2FA is not enabled for this account.',
      code: 'TWO_FACTOR_NOT_ENABLED',
    });
  }

  const backupCodes = generateBackupCodes(twoFactor.backupCodes ?? []);
  const replaced = await userTwoFactorService.replaceBackupCodes(
    userId,
    twoFactor.secret,
    twoFactor.backupCodes,
    backupCodes,
  );
  if (!replaced) {
    throw apiError({
      status: 409,
      statusText: 'Conflict',
      message: 'Two-factor authentication changed. Try again.',
      code: 'TWO_FACTOR_CHANGED',
    });
  }

  const response: TwoFactorBackupCodesPayload = { backupCodes };
  return success(response);
});
