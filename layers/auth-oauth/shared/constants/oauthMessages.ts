import en from '../../i18n/locales/en.json';

export const OAUTH_EMAIL_IN_USE = en.auth_oauth.email_in_use;

export const OAUTH_ERROR_MESSAGES = {
  'oauth-email-in-use': {
    key: 'auth_oauth.email_in_use',
    fallback: OAUTH_EMAIL_IN_USE,
  },
  'oauth-provider-conflict': {
    key: 'auth_oauth.provider_conflict',
    fallback: en.auth_oauth.provider_conflict,
  },
  'oauth-email-missing': {
    key: 'auth_oauth.email_missing',
    fallback: en.auth_oauth.email_missing,
  },
  'oauth-already-linked': {
    key: 'auth_oauth.already_linked',
    fallback: en.auth_oauth.already_linked,
  },
  'oauth-already-connected': {
    key: 'auth_oauth.already_connected',
    fallback: en.auth_oauth.already_connected,
  },
  'oauth-error': {
    key: 'auth_oauth.authentication_failed',
    fallback: en.auth_oauth.authentication_failed,
  },
  'not-authenticated': {
    key: 'auth_oauth.link_requires_sign_in',
    fallback: en.auth_oauth.link_requires_sign_in,
  },
  'unlink-last-method': {
    key: 'settings.connected.unlink_last_method',
    fallback: en.settings.connected.unlink_last_method,
  },
};

export const OAUTH_SUCCESS_MESSAGES = {
  'oauth-linked': 'settings.connected.callback.oauth-linked',
  'oauth-unlinked': 'settings.connected.callback.oauth-unlinked',
};
