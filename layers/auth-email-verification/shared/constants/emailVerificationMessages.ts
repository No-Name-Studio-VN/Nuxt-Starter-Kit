import en from '../../i18n/locales/en.json';
import type { AuthErrorMessage } from '#layers/auth/types/auth';
import type {
  EmailVerificationErrorCode,
  EmailVerificationSuccessCode,
} from '../../types/emailVerification';

export const EMAIL_VERIFICATION_ERROR_MESSAGES: Record<
  EmailVerificationErrorCode,
  AuthErrorMessage
> = {
  'email-not-verified': {
    key: 'auth.verify_email_required',
    fallback: en.auth.verify_email_required,
  },
  'invalid-token': {
    key: 'auth.verify_email_invalid_token',
    fallback: en.auth.verify_email_invalid_token,
  },
  'token-expired': {
    key: 'auth.verify_email_expired_token',
    fallback: en.auth.verify_email_expired_token,
  },
  'resend-too-soon': {
    key: 'auth.verify_email_resend_wait',
    fallback: en.auth.verify_email_resend_wait,
  },
};

export const EMAIL_VERIFICATION_SUCCESS_MESSAGES: Record<EmailVerificationSuccessCode, string> = {
  'email-verified': 'auth.email_verified',
  'verification-sent': 'auth.verification_sent',
};
