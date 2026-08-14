import * as OTPAuth from 'otpauth';
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse';
import userLockScreenService from '~~/server/utils/database/userLockScreen';
import { getAuthorizedUserId } from '~~/server/utils/authorization';
import { MAX_TOTP_ATTEMPTS } from '#shared/constants/totp';
import type { LockScreenValidationPayload } from '~~/types/userSecurity';
import { validateTotpSchema } from '#shared/schemas/userSecuritySchema';

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event);

  const result = await readValidatedBody(event, (body) => validateTotpSchema.safeParse(body));
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. The submitted authenticator code format is invalid.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  const { code } = result.data;
  const lockScreen = await userLockScreenService.getById(userId);

  if (!lockScreen || !lockScreen.totpEnabled || !lockScreen.totpSecret) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'Not Found. No Authenticator App is configured for this account.',
      code: 'TWO_FACTOR_NOT_CONFIGURED',
    });
  }

  // Check if max attempts reached
  if (lockScreen.failedAttempts >= MAX_TOTP_ATTEMPTS) {
    throw apiError({
      status: 429,
      statusText: 'Too Many Requests',
      message: 'Too Many Requests. Maximum authenticator code verification attempts exceeded.',
      code: 'TOTP_ATTEMPT_LIMIT_EXCEEDED',
    });
  }

  const totp = new OTPAuth.TOTP({
    issuer: 'Gromet Reader',
    label: 'Lock Screen',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(lockScreen.totpSecret),
  });

  // We allow a window of 1 (30 seconds before and after)
  const delta = totp.validate({ token: code, window: 1 });
  let isCorrect = delta !== null;
  const now = new Date();

  // Also check if it's a backup code if regular TOTP fails
  if (!isCorrect && lockScreen.backupCodes && lockScreen.backupCodes.length > 0) {
    const backupIndex = lockScreen.backupCodes.indexOf(code);
    if (backupIndex !== -1) {
      isCorrect = true;
      // Remove the used backup code
      const newBackupCodes = [...lockScreen.backupCodes];
      newBackupCodes.splice(backupIndex, 1);
      await userLockScreenService.update({
        userId,
        backupCodes: newBackupCodes,
      });
    }
  }

  if (isCorrect) {
    // Reset failed attempts on success
    await userLockScreenService.update({
      userId,
      failedAttempts: 0,
      lastActivityTime: now,
    });

    const response: LockScreenValidationPayload = { valid: true };
    return success(response);
  } else {
    // Increment failed attempts
    const newFailedAttempts = lockScreen.failedAttempts + 1;
    await userLockScreenService.update({
      userId,
      failedAttempts: newFailedAttempts,
      lastFailedAttempt: now,
      lastActivityTime: now,
    });

    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Unauthorized. The authenticator code you entered is incorrect.',
      code: 'INVALID_TWO_FACTOR_CODE',
      details: { valid: false, remainingAttempts: MAX_TOTP_ATTEMPTS - newFailedAttempts },
    });
  }
});
