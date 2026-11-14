export const authRoutes = {
  AUTH_LOGIN: '/auth/login',
  AUTH_REGISTER: '/auth/register',
  AUTH_FORGOT_PASSWORD: '/auth/forgot-password',
  AUTH_RESET_PASSWORD: '/auth/reset-password',
  AUTH_GOOGLE: '/api/auth/google',
  AUTH_OAUTH_URL: '/api/auth/oauth/url',
  AUTH_OAUTH_UNLINK: '/api/auth/oauth/unlink',

  MY_PROFILE: '/api/users/me',
  MY_LOCK_SCREEN: '/api/users/me/lock-screen',

  AUTH_LOGIN_PASSWORD: '/api/auth/login-password',
  AUTH_REGISTER_PASSWORD: '/api/auth/register-password',
  AUTH_FORGOT_PASSWORD_REQUEST: '/api/auth/forgot-password',
  AUTH_GOOGLE_ONE_TAP: '/api/auth/google-one-tap',
  AUTH_ACCOUNT_STATUS: '/api/auth/account-status',
  MY_PASSWORD: '/api/users/me/password',
  ACCOUNT_DELETE: '/api/account',
  MY_PROFILE_UPDATE: '/api/users/me/profile',

  userProfile: (userId: string | number) => `/api/users/${userId}/profile`,
};
