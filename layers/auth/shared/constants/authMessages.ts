import type { AuthErrorCode, AuthSuccessCode, AuthMessages } from '../../types/auth';

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
  'password-reset': 'Your password has been reset. You can now sign in with your new password.',
  'reset-link-sent': "If an account exists with that email, we've sent a password reset link.",
};

export type { AuthErrorCode, AuthSuccessCode } from '../../types/auth';

const extraErrorMessages = new Map<string, string>();
const extraSuccessMessages = new Map<string, string>();

/** Adds messages owned by installed layers without making auth depend on them. */
export function registerAuthMessages(messages: AuthMessages): void {
  for (const [code, message] of Object.entries(messages.errors)) {
    extraErrorMessages.set(code, message);
  }
  for (const [code, message] of Object.entries(messages.success)) {
    extraSuccessMessages.set(code, message);
  }
}

function isAuthErrorCode(errorCode: string): errorCode is AuthErrorCode {
  return errorCode in AUTH_ERROR_MESSAGES;
}

function isAuthSuccessCode(successCode: string): successCode is AuthSuccessCode {
  return successCode in AUTH_SUCCESS_MESSAGES;
}

export function getAuthSuccessMessage(successCode: string): string | null {
  return isAuthSuccessCode(successCode)
    ? AUTH_SUCCESS_MESSAGES[successCode]
    : (extraSuccessMessages.get(successCode) ?? null);
}

/**
 * Get user-friendly error message by error code
 */
export function getAuthErrorMessage(errorCode: string | null | undefined): string | null {
  if (!errorCode) return null;
  return isAuthErrorCode(errorCode)
    ? AUTH_ERROR_MESSAGES[errorCode]
    : (extraErrorMessages.get(errorCode) ?? 'An error occurred. Please try again.');
}
