import { describe, expect, it } from 'vitest';
import * as authMessages from '../../../layers/auth/shared/constants/authMessages';
import { OAUTH_ERROR_MESSAGES } from '../../../layers/auth-oauth/shared/constants/oauthMessages';

describe('sign-in feedback', () => {
  it('rejects inherited names as error codes without displaying their values', () => {
    expect(authMessages.isAuthErrorCode('constructor')).toBe(false);
    expect(authMessages.getAuthErrorMessage('constructor')).toBe(
      'An error occurred. Please try again.',
    );
  });

  it('explains that a locked account cannot sign in', () => {
    expect(authMessages.getAuthErrorMessage('account-locked')).toMatch(/account is locked/i);
  });

  it('explains that the chosen method cannot complete a required sign-in step', () => {
    expect(authMessages.getAuthErrorMessage('sign-in-step-required')).toMatch(
      /needs another step/i,
    );
  });

  it('tells an OAuth user with a taken email to use their existing sign-in method', () => {
    authMessages.registerAuthMessages({ errors: OAUTH_ERROR_MESSAGES, success: {} });
    expect(authMessages.getAuthErrorMessage('oauth-email-in-use')).toMatch(
      /existing sign-in method/i,
    );
  });
});
