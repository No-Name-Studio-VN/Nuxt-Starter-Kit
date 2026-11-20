import authTokenService from '#layers/auth/server/utils/database/authToken';
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

  if (!tokenRecord || !(await authTokenService.redeemEmailVerification(tokenRecord))) {
    return sendRedirect(event, authRoutes.AUTH_LOGIN + '?error=invalid-token');
  }

  return sendRedirect(event, authRoutes.AUTH_LOGIN + '?success=email-verified');
});
