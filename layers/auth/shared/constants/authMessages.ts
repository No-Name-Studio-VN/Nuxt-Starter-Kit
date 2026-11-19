import type { AuthErrorCode, AuthMessages } from '../../types/auth';

/**
 * Authentication error messages for user-facing display
 */
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  validation: 'Please check your input and try again. All fields are required.',
  unknown: 'An unexpected error occurred. Please try again later.',
};

export type { AuthErrorCode } from '../../types/auth';

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

export function getAuthSuccessMessage(successCode: string): string | null {
  return extraSuccessMessages.get(successCode) ?? null;
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
