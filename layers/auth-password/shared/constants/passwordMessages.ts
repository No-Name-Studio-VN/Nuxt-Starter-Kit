import en from '../../i18n/locales/en.json';

export const PASSWORD_ERROR_MESSAGES = {
  'bot-protection': {
    key: 'auth_password.bot_protection_failed',
    fallback: en.auth_password.bot_protection_failed,
  },

  // Registration errors
  existed: { key: 'auth_password.username_taken', fallback: en.auth_password.username_taken },
  'email-existed': { key: 'auth_password.email_taken', fallback: en.auth_password.email_taken },

  // Login errors
  'invalid-credentials': {
    key: 'auth_password.invalid_credentials',
    fallback: en.auth_password.invalid_credentials,
  },

  // Password reset errors
  'reset-invalid-token': {
    key: 'auth_password.invalid_reset_token',
    fallback: en.auth_password.invalid_reset_token,
  },
  'reset-token-expired': {
    key: 'auth_password.expired_reset_token',
    fallback: en.auth_password.expired_reset_token,
  },
};

export const PASSWORD_SUCCESS_MESSAGES = {
  'password-reset': 'auth_password.reset_password_success',
  'reset-link-sent': 'auth_password.reset_link_sent',
};
