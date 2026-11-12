import type { AuthErrorCode, AuthSuccessCode } from '../../types/auth';

/**
 * Authentication error messages for user-facing display
 */
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  // Registration errors
  validation: 'Please check your input and try again. All fields are required.',
  captcha: 'Security verification failed. Please refresh the page and try again.',
  existed: 'This username is already taken. Please choose a different username.',
  'email-existed': 'This email is already in use. Please choose a different email.',
  unknown: 'An unexpected error occurred. Please try again later.',

  // Login errors
  'invalid-credentials':
    'Invalid username or password. Please check your credentials and try again.',
  'email-not-verified':
    'Your email address has not been verified. Please check your inbox for the verification link.',

  // Email verification errors
  'invalid-token': 'This verification link is invalid or has already been used.',
  'token-expired': 'This link has expired. Please request a new one.',
  'resend-too-soon':
    'A verification email was recently sent. Please check your inbox or wait a moment before requesting another.',

  // Password reset errors
  'reset-invalid-token': 'This reset link is invalid or has already been used.',
  'reset-token-expired': 'This reset link has expired. Please request a new one.',

  // OAuth errors
  'oauth-already-linked': 'This account is already linked to another user.',
  'oauth-already-connected': 'You already have an account from this provider linked.',
  'oauth-error': 'Authentication failed. Please try again.',
  'not-authenticated': 'You need to be logged in to link an account.',
  'unlink-last-method': "You can't unlink your only sign-in method. Set a password first.",
};

/**
 * Authentication success messages for user-facing display
 */
export const AUTH_SUCCESS_MESSAGES: Record<AuthSuccessCode, string> = {
  'oauth-linked': 'Account linked successfully!',
  'oauth-unlinked': 'Account unlinked successfully.',
  'email-verified': 'Your email has been verified! You can now sign in.',
  'password-reset': 'Your password has been reset. You can now sign in with your new password.',
  'verification-sent': 'A verification email has been sent. Please check your inbox.',
  'reset-link-sent': "If an account exists with that email, we've sent a password reset link.",
};

export type { AuthErrorCode, AuthSuccessCode } from '../../types/auth';

function isAuthErrorCode(errorCode: string): errorCode is AuthErrorCode {
  return errorCode in AUTH_ERROR_MESSAGES;
}

/**
 * Get user-friendly error message by error code
 */
export function getAuthErrorMessage(errorCode: string | null | undefined): string | null {
  if (!errorCode) return null;
  return isAuthErrorCode(errorCode)
    ? AUTH_ERROR_MESSAGES[errorCode]
    : 'An error occurred. Please try again.';
}
