import * as OTPAuth from 'otpauth';
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse';
import userLockScreenService from '~~/server/utils/database/userLockScreen';
import userService from '~~/server/utils/database/user';
import { MAX_TOTP_ATTEMPTS } from '#shared/constants/totp';
import type { LockScreenValidationPayload } from '~~/types/userSecurity';
import { loginTwoFactorSchema } from '#shared/schemas/userSecuritySchema';

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, (body) => loginTwoFactorSchema.safeParse(body));
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. Invalid code format.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  // Get temporary login session
  const session = await getUserSession(event);
  if (!session.secure?.pending2faUserId) {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Session expired or invalid. Please log in again.',
      code: 'SESSION_INVALID',
    });
  }

  const userId = session.secure.pending2faUserId;
  if (typeof userId !== 'number') {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Session expired or invalid. Please log in again.',
      code: 'SESSION_INVALID',
    });
  }
  const { code } = result.data;

  const lockScreen = await userLockScreenService.getById(userId);
  if (!lockScreen || !lockScreen.totpEnabled || !lockScreen.totpSecret) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: '2FA is not enabled for this account.',
      code: 'TWO_FACTOR_NOT_ENABLED',
    });
  }

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
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(lockScreen.totpSecret),
  });

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

  if (!isCorrect) {
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
      message: 'Unauthorized. The 2FA code you entered is incorrect.',
      code: 'INVALID_TWO_FACTOR_CODE',
      details: { valid: false, remainingAttempts: MAX_TOTP_ATTEMPTS - newFailedAttempts },
    });
  }

  // Code is correct! We log them in securely.
  // Reset failed attempts
  await userLockScreenService.update({
    userId,
    failedAttempts: 0,
    lastActivityTime: now,
  });

  // Set the actual user session
  const user = await userService.getById(userId);
  if (!user) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'User not found.',
      code: 'USER_NOT_FOUND',
    });
  }

  await setUserSession(event, {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      isAdmin: user.isAdmin,
      skipLockOnInit: true, // Bypass lock screen post-login
    },
  });

  const response: LockScreenValidationPayload = { valid: true };
  return success(response);
});
