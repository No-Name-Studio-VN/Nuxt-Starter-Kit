export const OAUTH_EMAIL_IN_USE =
  'This email is already in use. Sign in with your existing sign-in method.';

export const OAUTH_ERROR_MESSAGES = {
  'oauth-email-in-use': {
    key: 'auth_oauth.email_in_use',
    fallback: OAUTH_EMAIL_IN_USE,
  },
  'oauth-provider-conflict': {
    key: 'auth_oauth.provider_conflict',
    fallback: 'You already have an account from this provider linked. Sign in with your existing method.',
  },
  'oauth-email-missing': {
    key: 'auth_oauth.email_missing',
    fallback: 'The provider did not share an email address.',
  },
  'oauth-already-linked': 'This account is already linked to another user.',
  'oauth-already-connected': 'You already have an account from this provider linked.',
  'oauth-error': 'Authentication failed. Please try again.',
  'not-authenticated': 'You need to be logged in to link an account.',
  'unlink-last-method':
    "You can't unlink your only sign-in method. Add another way to sign in first.",
};

export const OAUTH_SUCCESS_MESSAGES = {
  'oauth-linked': 'Account linked successfully!',
  'oauth-unlinked': 'Account unlinked successfully.',
};
