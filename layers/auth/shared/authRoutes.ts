export const authRoutes = {
  AUTH_LOGIN: '/auth/login',

  MY_PROFILE: '/api/users/me',
  MY_LOCK_SCREEN: '/api/users/me/lock-screen',

  AUTH_ACCOUNT_STATUS: '/api/auth/account-status',
  MY_PROFILE_UPDATE: '/api/users/me/profile',

  userProfile: (userId: string | number) => `/api/users/${userId}/profile`,
};
