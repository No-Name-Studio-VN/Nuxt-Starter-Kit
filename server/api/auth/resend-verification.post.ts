import { apiError, zodErrorToFieldErrors } from '#layers/server-core/server/utils/apiResponse';
import userService from '#layers/auth/server/utils/database/user';
import authTokenService from '#layers/auth/server/utils/database/authToken';
import { sendVerificationEmail } from '#layers/auth/server/utils/email';
import { AuthTokenType } from '#layers/auth/shared/constants/authTokens';
import { resendVerificationSchema } from '#layers/auth/shared/schemas/userSchema';

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, (body) => resendVerificationSchema.safeParse(body));
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Valid email is required.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  const user = await userService.getByEmail(result.data.email);

  // Always return success to prevent email enumeration
  if (!user || user.emailVerified) {
    return success({});
  }

  const hasRecent = await authTokenService.hasRecentToken(user.id, AuthTokenType.EmailVerification);
  if (hasRecent) {
    throw apiError({
      status: 429,
      statusText: 'Too Many Requests',
      message:
        'A verification email was recently sent. Please wait a moment before requesting another.',
      code: 'VERIFICATION_EMAIL_RATE_LIMITED',
    });
  }

  await authTokenService.invalidateUserTokens(user.id, AuthTokenType.EmailVerification);
  const token = await authTokenService.createToken(user.id, AuthTokenType.EmailVerification);
  await sendVerificationEmail(user.email, user.username, token);

  return success({});
});
