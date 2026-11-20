import { apiError, success, zodErrorToFieldErrors } from '#layers/server-core/server/utils/apiResponse';
import userService from '#layers/auth/server/utils/database/user';
import authTokenService from '#layers/auth-password/server/utils/database/authToken';
import { EmailVerificationTokenType } from '#layers/auth-email-verification/shared/constants/emailVerificationTokens';
import { resendVerificationSchema } from '../../../shared/schemas/emailVerificationSchema';
import { sendVerificationEmail } from '../../utils/verificationEmail';

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

  const matches = await userService.listByEmail(result.data.email);
  const user = matches.length === 1 ? matches[0] : undefined;

  // Always return success to prevent email enumeration
  if (!user || user.emailVerified) {
    return success({});
  }

  const hasRecent = await authTokenService.hasRecentToken(
    user.id,
    EmailVerificationTokenType.EmailVerification,
    user.email,
  );
  if (hasRecent) {
    throw apiError({
      status: 429,
      statusText: 'Too Many Requests',
      message:
        'A verification email was recently sent. Please wait a moment before requesting another.',
      code: 'VERIFICATION_EMAIL_RATE_LIMITED',
    });
  }

  await authTokenService.invalidateEmailBoundTokens(
    user,
    EmailVerificationTokenType.EmailVerification,
  );
  const token = await authTokenService.createEmailBoundToken(
    user,
    EmailVerificationTokenType.EmailVerification,
  );
  if (!token) return success({});
  await sendVerificationEmail(user.email, user.username, token);

  return success({});
});
