export enum AuthTokenType {
  PasswordReset = 'password_reset',
  // Keep the persisted kind known to auth even when the verification layer is disabled.
  EmailVerification = 'email_verification',
}

/** Password reset token expires in 1 hour */
export const PASSWORD_RESET_EXPIRY_MS = 60 * 60 * 1000;

/** Minimum interval between resend requests (2 minutes) */
export const RESEND_COOLDOWN_MS = 2 * 60 * 1000;
