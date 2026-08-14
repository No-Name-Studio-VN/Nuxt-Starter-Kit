import type { OAuthPopupCompleteMessage } from '~~/types/auth';

export function isOAuthPopupCompleteMessage(value: unknown): value is OAuthPopupCompleteMessage {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'oauth:complete' &&
    'url' in value &&
    typeof value.url === 'string'
  );
}

export function parseOAuthPopupCompleteMessage(
  value: string | null,
): OAuthPopupCompleteMessage | null {
  if (!value) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return isOAuthPopupCompleteMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
