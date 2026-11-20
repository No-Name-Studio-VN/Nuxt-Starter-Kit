import { registerAuthTokenKind } from '#layers/auth/server/utils/authTokenKinds';
import {
  EMAIL_VERIFICATION_EXPIRY_MS,
  EmailVerificationTokenType,
} from '#layers/auth-email-verification/shared/constants/emailVerificationTokens';
import { registerEmailChangedHook } from '#layers/auth/server/utils/emailChangedHooks';
import { registerLoginPolicy } from '#layers/auth/server/utils/loginPolicies';
import { registerPostRegisterStep } from '#layers/auth/server/utils/postRegisterSteps';
import authTokenService from '#layers/auth/server/utils/database/authToken';
import { emailVerificationRoutes } from '#layers/auth-email-verification/shared/emailVerificationRoutes';
import { sendVerificationEmail } from '#layers/auth-email-verification/server/utils/verificationEmail';
import type { User } from '#layers/auth/types/auth';
import type { EmailChangedContext } from '#layers/auth/types/loginPolicies';

function verifyEmailNotice(email: string, redirectTo: string): string {
  return (
    emailVerificationRoutes.AUTH_VERIFY_EMAIL +
    '?email=' +
    encodeURIComponent(email) +
    '&redirectTo=' +
    encodeURIComponent(redirectTo)
  );
}

async function queueVerificationEmail(event: EmailChangedContext['event'], user: User) {
  const token = await authTokenService.createEmailBoundToken(
    user,
    EmailVerificationTokenType.EmailVerification,
  );

  const delivery = sendVerificationEmail(user.email, user.username, token).catch((err) => {
    console.error('[Email Verification] Failed to send verification email:', err);
  });

  if ('waitUntil' in event && typeof event.waitUntil === 'function') {
    event.waitUntil(delivery);
  } else {
    await delivery;
  }
}

/**
 * Holds a password sign-in until the email address is verified, and sends the
 * verification link once a password registration has created the account.
 * The policy runs before the account lock (150), so an unverified sign-in is
 * not recorded as a login.
 */
export default defineNitroPlugin(() => {
  registerAuthTokenKind({
    id: EmailVerificationTokenType.EmailVerification,
    expiresInMs: EMAIL_VERIFICATION_EXPIRY_MS,
  });

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
    async run({ event, user, redirectTo }) {
      await queueVerificationEmail(event, user);
      return { redirect: verifyEmailNotice(user.email, redirectTo) };
    },
  });

  registerEmailChangedHook({
    id: 'email-verification',
    order: 100,
    async run({ event, user }) {
      try {
        await queueVerificationEmail(event, user);
      } catch {
        // The profile change is already committed; the user can resend verification.
        console.error('[Email Verification] Failed to prepare verification email after profile update.');
      }
    },
  });
});
