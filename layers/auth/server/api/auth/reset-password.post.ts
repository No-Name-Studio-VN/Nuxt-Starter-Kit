import authTokenService from '#layers/auth/server/utils/database/authToken';
import { apiError, success, zodErrorToFieldErrors } from '#layers/server-core/server/utils/apiResponse';
import { AuthTokenType } from '#layers/auth/shared/constants/authTokens';
import { resetPasswordSchema } from '#layers/auth/shared/schemas/userSchema';

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, (body) => resetPasswordSchema.safeParse(body));
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Please check your input and try again.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    });
  }

  const invalidToken = () => apiError({
    status: 400,
    statusText: 'Bad Request',
    message: 'The reset link is invalid or has expired.',
    code: 'RESET_TOKEN_INVALID',
  });
  const tokenRecord = await authTokenService.verifyToken(
    result.data.token,
    AuthTokenType.PasswordReset,
  );
  if (!tokenRecord) throw invalidToken();

  const hashedPassword = await hashPassword(result.data.password);
  const reset = await authTokenService.redeemPasswordReset(tokenRecord, hashedPassword);
  if (!reset) throw invalidToken();

  return success(reset);
});
