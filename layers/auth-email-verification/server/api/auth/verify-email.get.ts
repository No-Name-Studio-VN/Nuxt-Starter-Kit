import authTokenService from '#layers/auth/server/utils/database/authToken';
import userService from '#layers/auth/server/utils/database/user';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import { EmailVerificationTokenType } from '#layers/auth-email-verification/shared/constants/emailVerificationTokens';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const token = typeof query.token === 'string' ? query.token : '';

  if (!token) {
    return sendRedirect(event, authRoutes.AUTH_LOGIN + '?error=invalid-token');
  }

  const tokenRecord = await authTokenService.verifyToken(
    token,
    EmailVerificationTokenType.EmailVerification,
  );

  if (!tokenRecord) {
    return sendRedirect(event, authRoutes.AUTH_LOGIN + '?error=invalid-token');
  }

  if (tokenRecord.expiresAt < new Date()) {
    return sendRedirect(event, authRoutes.AUTH_LOGIN + '?error=token-expired');
  }

  const user = await userService.getById(tokenRecord.userId);
  if (!user) {
    return sendRedirect(event, authRoutes.AUTH_LOGIN + '?error=invalid-token');
  }

  await userService.update({ id: user.id, emailVerified: true });
  await authTokenService.markUsed(tokenRecord.id);
  await authTokenService.invalidateUserTokens(
    user.id,
    EmailVerificationTokenType.EmailVerification,
  );

  return sendRedirect(event, authRoutes.AUTH_LOGIN + '?success=email-verified');
});
