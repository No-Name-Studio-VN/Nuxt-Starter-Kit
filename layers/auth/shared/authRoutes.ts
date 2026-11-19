export const authRoutes = {
  AUTH_LOGIN: '/auth/login',
  AUTH_REGISTER: '/auth/register',
  AUTH_FORGOT_PASSWORD: '/auth/forgot-password',
  AUTH_RESET_PASSWORD: '/auth/reset-password',

  MY_PROFILE: '/api/users/me',
  MY_LOCK_SCREEN: '/api/users/me/lock-screen',

  AUTH_LOGIN_PASSWORD: '/api/auth/login-password',
  AUTH_REGISTER_PASSWORD: '/api/auth/register-password',
  AUTH_FORGOT_PASSWORD_REQUEST: '/api/auth/forgot-password',
  AUTH_ACCOUNT_STATUS: '/api/auth/account-status',
  MY_PASSWORD: '/api/users/me/password',
  MY_PROFILE_UPDATE: '/api/users/me/profile',

  userProfile: (userId: string | number) => `/api/users/${userId}/profile`,
};
