import * as OTPAuth from 'otpauth';
import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import userLockScreenService from '#layers/auth/server/utils/database/userLockScreen';
import userTwoFactorService from '#layers/auth-2fa/server/utils/database/userTwoFactor';
import { getAuthorizedUserId } from '#layers/auth/server/utils/authorization';
import type { TwoFactorVerifyPayload } from '#layers/auth-2fa/types/twoFactor';
import { verifyTotpSchema } from '#layers/auth-2fa/shared/schemas/twoFactorSchema';

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
  const twoFactor = await userTwoFactorService.getById(userId);

  if (!twoFactor || !twoFactor.secret) {
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
    secret: OTPAuth.Secret.fromBase32(twoFactor.secret),
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

  await userTwoFactorService.update({
    userId,
    enabled: true,
    backupCodes,
  });
  await userLockScreenService.update({
    userId,
    lastActivityTime: now,
  });

  const response: TwoFactorVerifyPayload = { backupCodes };
  return success(response);
});
