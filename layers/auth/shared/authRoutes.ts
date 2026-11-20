export const authRoutes = {
  AUTH_LOGIN: '/auth/login',

  ONBOARDING: '/onboarding',
  ONBOARDING_STATUS: '/api/onboarding',
  ONBOARDING_COMPLETE: '/api/onboarding/complete',
  SETTINGS_PROFILE: '/settings/profile',
  SETTINGS_SECURITY: '/settings/security',
  USERNAME_AVAILABILITY: '/api/users/username-availability',

  MY_PROFILE: '/api/users/me',
  MY_LOCK_SCREEN: '/api/users/me/lock-screen',

  AUTH_ACCOUNT_STATUS: '/api/auth/account-status',
  MY_PROFILE_UPDATE: '/api/users/me/profile',

  onboardingStep: (stepId: string) => `/api/onboarding/steps/${encodeURIComponent(stepId)}`,
  user: (userId: number) => `/api/users/${userId}`,
  userUsername: (userId: string | number) => `/api/users/${userId}/username`,
  userProfile: (userId: string | number) => `/api/users/${userId}/profile`,
};
