import en from '../../i18n/locales/en.json';
import type { AuthErrorCode, AuthErrorMessage, AuthMessages } from '../../types/auth';

/**
 * Authentication error messages for user-facing display
 */
export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, AuthErrorMessage> = {
  validation: { key: 'auth.validation_failed', fallback: en.auth.validation_failed },
  unknown: { key: 'auth.unknown_error', fallback: en.auth.unknown_error },
  'account-locked': {
    key: 'auth.account_locked',
    fallback: en.auth.account_locked,
  },
  'sign-in-step-required': {
    key: 'auth.sign_in_step_required',
    fallback: en.auth.sign_in_step_required,
  },
};

export type { AuthErrorCode } from '../../types/auth';

const defaultError: AuthErrorMessage = {
  key: 'auth.request_failed',
  fallback: en.auth.request_failed,
};

function findAuthError(errorCode: string) {
  return isAuthErrorCode(errorCode)
    ? AUTH_ERROR_MESSAGES[errorCode]
    : (extraErrorMessages.get(errorCode) ?? defaultError);
}

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
  const message = findAuthError(errorCode);
  return typeof message === 'string' ? message : (translate?.(message.key) ?? message.fallback);
}
