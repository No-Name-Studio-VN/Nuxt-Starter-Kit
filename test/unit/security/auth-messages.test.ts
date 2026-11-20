import { describe, expect, it } from 'vitest';
import { getAuthErrorMessage } from '../../../layers/auth/shared/constants/authMessages';

describe('auth redirect errors', () => {
  it.each([
    ['oauth-email-in-use', 'auth.oauth_email_in_use'],
    ['oauth-provider-conflict', 'auth.oauth_provider_conflict'],
    ['oauth-email-missing', 'auth.oauth_email_missing'],
  ])('resolves %s to its localized message', (code, key) => {
    const translate = (message: string) => message === key ? 'Localized OAuth error' : message;
    expect(getAuthErrorMessage(code, translate)).toBe('Localized OAuth error');
  });

  it('preserves existing display strings for errors without an i18n key', () => {
    expect(getAuthErrorMessage('oauth-error', () => 'Localized OAuth error')).toBe('Authentication failed. Please try again.');
  });
});
