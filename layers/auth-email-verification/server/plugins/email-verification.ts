import { registerLoginPolicy } from '#layers/auth/server/utils/loginPolicies';
import { registerPostRegisterStep } from '#layers/auth/server/utils/postRegisterSteps';
import authTokenService from '#layers/auth/server/utils/database/authToken';
import { AuthTokenType } from '#layers/auth/shared/constants/authTokens';
import { emailVerificationRoutes } from '#layers/auth-email-verification/shared/emailVerificationRoutes';
import { sendVerificationEmail } from '#layers/auth-email-verification/server/utils/verificationEmail';

function verifyEmailNotice(email: string, redirectTo: string): string {
  return (
    emailVerificationRoutes.AUTH_VERIFY_EMAIL +
    '?email=' +
    encodeURIComponent(email) +
    '&redirectTo=' +
    encodeURIComponent(redirectTo)
  );
}

/**
 * Holds a password sign-in until the email address is verified, and sends the
 * verification link once a password registration has created the account.
 * The policy runs before the account lock (150), so an unverified sign-in is
 * not recorded as a login.
 */
export default defineNitroPlugin(() => {
  registerLoginPolicy({
    id: 'email-verification',
    order: 100,
    async run({ event, user, redirectTo }) {
      if (user.emailVerified) {
        return { kind: 'continue' };
      }

      return {
        kind: 'respond',
        body: sendRedirect(event, verifyEmailNotice(user.email, redirectTo)),
      };
    },
  });

  registerPostRegisterStep({
    id: 'email-verification',
    order: 100,
    async run({ user, redirectTo }) {
      const verificationToken = await authTokenService.createToken(
        user.id,
        AuthTokenType.EmailVerification,
      );
      // Non-blocking: a failed send must not fail the registration.
      sendVerificationEmail(user.email, user.username, verificationToken).catch((err) => {
        console.error('[Register] Failed to send verification email:', err);
      });

      return { redirect: verifyEmailNotice(user.email, redirectTo) };
    },
  });
});
