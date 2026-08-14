import * as OTPAuth from 'otpauth';
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse';
import userLockScreenService from '~~/server/utils/database/userLockScreen';
import { getAuthorizedUserId } from '~~/server/utils/authorization';
import type { TwoFactorVerifyPayload } from '~~/types/userSecurity';
import { verifyTotpSchema } from '#shared/schemas/userSecuritySchema';

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event);
  const result = await readValidatedBody(event, (body) => verifyTotpSchema.safeParse(body));
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. Invalid format.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  const { code } = result.data;
  const lockScreen = await userLockScreenService.getById(userId);

  if (!lockScreen || !lockScreen.totpSecret) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'Not Found. No 2FA setup started.',
      code: 'TWO_FACTOR_SETUP_NOT_FOUND',
    });
  }

  const totp = new OTPAuth.TOTP({
    issuer: 'Gromet Reader',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(lockScreen.totpSecret),
  });

  // Verify the code
  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Unauthorized. The authenticator code you entered is incorrect.',
      code: 'INVALID_TWO_FACTOR_CODE',
    });
  }

  // Code is verified, enable 2FA and generate 10 block backup codes
  const cryptoStr = () => Math.random().toString(36).substring(2, 10).toUpperCase();
  const backupCodes = Array.from({ length: 10 }, () => cryptoStr());
  const now = new Date();

  await userLockScreenService.update({
    userId,
    totpEnabled: true,
    backupCodes,
    lastActivityTime: now,
  });

  const response: TwoFactorVerifyPayload = { backupCodes };
  return success(response);
});
