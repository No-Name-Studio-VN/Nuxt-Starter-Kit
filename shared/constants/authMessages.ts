import type { AuthErrorCode, AuthSuccessCode } from '~~/types/auth'

/**
 * Authentication error messages for user-facing display.
 */
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  // Registration errors
  'validation': 'Please check your input and try again. All fields are required.',
  'captcha': 'Security verification failed. Please refresh the page and try again.',
  'existed': 'This username is already taken. Please choose a different username.',
  'email-existed': 'This email is already in use. Please choose a different email.',
  'unknown': 'An unexpected error occurred. Please try again later.',

  // Login errors
  'invalid-credentials': 'Invalid username or password. Please check your credentials and try again.',
  'email-not-verified': 'Please verify your email before signing in.',
  'invalid-token': 'This verification link is invalid. Please request a new one.',
  'token-expired': 'This verification link has expired. Please request a new one.',
  'resend-too-soon': 'A verification email was recently sent. Please wait a moment before requesting another.',
  'reset-invalid-token': 'This password reset link is invalid. Please request a new one.',
  'reset-token-expired': 'This password reset link has expired. Please request a new one.',
  'email-send-failed': 'We could not send the email right now. Please try resending it in a moment.',
  'two-factor-invalid': 'The two-factor authentication code is invalid.',
  'two-factor-required': 'Enter your two-factor authentication code to continue.',

  // OAuth errors
  'oauth-already-linked': 'This account is already linked to another user.',
  'oauth-already-connected': 'You already have an account from this provider linked.',
  'oauth-error': 'Authentication failed. Please try again.',
  'not-authenticated': 'You need to be logged in to link an account.',
  'unlink-last-method': 'You can\'t unlink your only sign-in method. Set a password first.',
}

/**
 * Authentication success messages for user-facing display.
 */
export const AUTH_SUCCESS_MESSAGES: Record<AuthSuccessCode, string> = {
  'oauth-linked': 'Account linked successfully!',
  'oauth-unlinked': 'Account unlinked successfully.',
  'email-verified': 'Email verified successfully. You can now sign in.',
  'password-reset': 'Your password was reset successfully. You can now sign in.',
  'verification-sent': 'Verification email sent. Please check your inbox.',
  'reset-link-sent': 'If an account exists for that email, a reset link has been sent.',
  'account-ready': 'Account created. Email delivery is not configured, so you can sign in now.',
}

/**
 * Get user-friendly error message by error code.
 */
export function getAuthErrorMessage(errorCode: string | null | undefined): string | null {
  if (!errorCode) return null
  if (isAuthErrorCode(errorCode)) return AUTH_ERROR_MESSAGES[errorCode]
  return 'An error occurred. Please try again.'
}

export function getAuthSuccessMessage(successCode: string | null | undefined): string | null {
  if (!successCode) return null
  if (isAuthSuccessCode(successCode)) return AUTH_SUCCESS_MESSAGES[successCode]
  return null
}

function isAuthErrorCode(value: string): value is AuthErrorCode {
  return value in AUTH_ERROR_MESSAGES
}

function isAuthSuccessCode(value: string): value is AuthSuccessCode {
  return value in AUTH_SUCCESS_MESSAGES
}
