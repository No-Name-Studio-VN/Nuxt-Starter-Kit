import * as OTPAuth from 'otpauth';
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse';
import userLockScreenService from '~~/server/utils/database/userLockScreen';
import userService from '~~/server/utils/database/user';
import { getAuthorizedUserId } from '~~/server/utils/authorization';
import type { TwoFactorSetupPayload } from '~~/types/userSecurity';
import { setupTotpSchema } from '#shared/schemas/userSecuritySchema';

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event);
  const session = await requireUserSession(event);
  const username = session.user.username || 'User';

  const result = await readValidatedBody(event, (body) => setupTotpSchema.safeParse(body));
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

  // Generate a new secure secret
  const secret = new OTPAuth.Secret({ size: 20 });

  const totp = new OTPAuth.TOTP({
    issuer: 'Gromet Reader',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secret,
  });

  // get the URI
  const uri = totp.toString();

  const existingLockScreen = await userLockScreenService.getById(userId);
  const now = new Date();

  if (existingLockScreen) {
    if (existingLockScreen.totpEnabled) {
      throw apiError({
        status: 400,
        statusText: 'Bad Request',
        message: 'Bad Request. 2FA is already enabled. Disable it first.',
        code: 'TWO_FACTOR_ALREADY_ENABLED',
      });
    }

    await userLockScreenService.update({
      userId,
      totpSecret: secret.base32,
      totpEnabled: false,
      lastActivityTime: now,
    });
  } else {
    await userLockScreenService.create({
      userId,
      totpSecret: secret.base32,
      totpEnabled: false,
      lastActivityTime: now,
    });
  }

  const response: TwoFactorSetupPayload = { uri, secret: secret.base32 };
  return success(response);
});
