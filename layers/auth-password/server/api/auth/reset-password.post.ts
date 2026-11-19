import authTokenService from '#layers/auth-password/server/utils/database/authToken';
import userService from '#layers/auth/server/utils/database/user';
import userPasswordService from '#layers/auth-password/server/utils/database/userPassword';
import { apiError, zodErrorToFieldErrors } from '#layers/server-core/server/utils/apiResponse';
import { AuthTokenType } from '#layers/auth-password/shared/constants/authTokens';
import { resetPasswordSchema } from '#layers/auth-password/shared/schemas/passwordSchema';

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

  const tokenRecord = await authTokenService.verifyToken(
    result.data.token,
    AuthTokenType.PasswordReset,
  );
  if (!tokenRecord) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'The reset link is invalid or has expired.',
      code: 'RESET_TOKEN_INVALID',
    });
  }

  const user = await userService.getById(tokenRecord.userId);
  if (!user) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'User not found.',
      code: 'USER_NOT_FOUND',
    });
  }

  await userPasswordService.set(user.id, result.data.password);
  await authTokenService.markUsed(tokenRecord.id);
  await authTokenService.invalidateUserTokens(user.id);

  // Also verify email if it wasn't verified (user proved email ownership via reset link)
  if (!user.emailVerified) {
    await userService.update({ id: user.id, emailVerified: true });
  }

  return success({});
});
