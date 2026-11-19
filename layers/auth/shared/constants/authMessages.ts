import type { AuthErrorCode, AuthErrorMessage, AuthMessages } from '../../types/auth';

/**
 * Authentication error messages for user-facing display
 */
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, AuthErrorMessage> = {
  validation: 'Please check your input and try again. All fields are required.',
  unknown: 'An unexpected error occurred. Please try again later.',
  'account-locked': {
    key: 'auth.account_locked',
    fallback: 'This account is locked. Contact support for help.',
  },
  'sign-in-step-required': {
    key: 'auth.sign_in_step_required',
    fallback: 'This account needs another step to sign in. Try a different sign-in method.',
  },
};

export type { AuthErrorCode } from '../../types/auth';

const extraErrorMessages = new Map<string, AuthErrorMessage>();
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

export function isAuthErrorCode(errorCode: string): errorCode is AuthErrorCode {
  return Object.hasOwn(AUTH_ERROR_MESSAGES, errorCode);
}

export function getAuthSuccessMessage(successCode: string): string | null {
  return extraSuccessMessages.get(successCode) ?? null;
}

/**
 * Get user-friendly error message by error code
 */
export function getAuthErrorMessage(
  errorCode: string | null | undefined,
  translate?: (key: string) => string,
): string | null {
  if (!errorCode) return null;
  const message = isAuthErrorCode(errorCode)
    ? AUTH_ERROR_MESSAGES[errorCode]
    : (extraErrorMessages.get(errorCode) ?? 'An error occurred. Please try again.');
  return typeof message === 'string' ? message : (translate?.(message.key) ?? message.fallback);
}
