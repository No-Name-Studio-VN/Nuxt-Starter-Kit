import { apiError, success, zodErrorToFieldErrors } from '#layers/server-core/server/utils/apiResponse';
import userService from '#layers/auth/server/utils/database/user';
import authTokenService from '#layers/auth-password/server/utils/database/authToken';
import { sendPasswordResetEmail } from '#layers/auth-password/server/utils/passwordResetEmail';
import { AuthTokenType } from '#layers/auth-password/shared/constants/authTokens';
import { forgotPasswordSchema } from '#layers/auth-password/shared/schemas/passwordSchema';

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, (body) => forgotPasswordSchema.safeParse(body));
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Valid email and security verification are required.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  const tokenValidation = await verifyTurnstileToken(result.data['cf-turnstile-response']);
  if (!tokenValidation.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Security verification failed. Please try again.',
      code: 'CAPTCHA_VERIFICATION_FAILED',
    });
  }

  const matches = await userService.listByEmail(result.data.email);
  const user = matches.length === 1 ? matches[0] : undefined;

  // Always return success to prevent email enumeration
  if (!user) {
    return success({});
  }

  const hasRecent = await authTokenService.hasRecentToken(user.id, AuthTokenType.PasswordReset, user.email);
  if (hasRecent) {
    // Still return success to prevent timing attacks
    return success({});
  }

  await authTokenService.invalidateEmailBoundTokens(user, AuthTokenType.PasswordReset);
  const token = await authTokenService.createEmailBoundToken(user, AuthTokenType.PasswordReset);
  if (!token) return success({});
  await sendPasswordResetEmail(user.email, user.username, token);

  return success({});
});
