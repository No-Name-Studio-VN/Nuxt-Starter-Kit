import { AuthTokenType } from '#layers/auth-password/shared/constants/authTokens';

export enum EmailVerificationTokenType {
  EmailVerification = AuthTokenType.EmailVerification,
}

/** Email verification token expires in 24 hours. */
export const EMAIL_VERIFICATION_EXPIRY_MS = 24 * 60 * 60 * 1000;
