import type {
  EmailVerificationErrorCode,
  EmailVerificationSuccessCode,
} from '../../types/emailVerification';

export const EMAIL_VERIFICATION_ERROR_MESSAGES: Record<EmailVerificationErrorCode, string> = {
  'email-not-verified':
    'Your email address has not been verified. Please check your inbox for the verification link.',
  'invalid-token': 'This verification link is invalid or has already been used.',
  'token-expired': 'This link has expired. Please request a new one.',
  'resend-too-soon':
    'A verification email was recently sent. Please check your inbox or wait a moment before requesting another.',
};

export const EMAIL_VERIFICATION_SUCCESS_MESSAGES: Record<EmailVerificationSuccessCode, string> = {
  'email-verified': 'Your email has been verified! You can now sign in.',
  'verification-sent': 'A verification email has been sent. Please check your inbox.',
};
