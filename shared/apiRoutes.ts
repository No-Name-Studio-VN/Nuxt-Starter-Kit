import type { NuxtSecurityRouteRules } from 'nuxt-security'

export const apiRoutes = {
  AUTH_LOGIN: '/auth/login',
  AUTH_REGISTER: '/auth/register',
  AUTH_FORGOT_PASSWORD: '/auth/forgot-password',
  AUTH_RESET_PASSWORD: '/auth/reset-password',
  AUTH_VERIFY_EMAIL: '/auth/verify-email',

  MY_PROFILE: '/api/users/me',
  MY_2FA_SETUP: '/api/users/me/2fa/setup',
  MY_2FA_VERIFY: '/api/users/me/2fa/verify',
  MY_2FA_DISABLE: '/api/users/me/2fa/disable',
  AUTH_GOOGLE: '/api/auth/google',
  AUTH_OAUTH_URL: '/api/auth/oauth/url',
  AUTH_OAUTH_UNLINK: '/api/auth/oauth/unlink',
  AUTH_FORGOT_PASSWORD_API: '/api/auth/forgot-password',
  AUTH_RESET_PASSWORD_API: '/api/auth/reset-password',
  AUTH_RESEND_VERIFICATION: '/api/auth/resend-verification',
  AUTH_LOGIN_2FA: '/api/auth/login-2fa',
}

const apiRules: NuxtSecurityRouteRules = {
  rateLimiter: {
    tokensPerInterval: 150,
    interval: 60000, // 60 seconds
    headers: true,
    throwError: true,
  },
}

export const routeRules = {
  '/api/**': {
    security: apiRules,
  },
  '/admin/**': {
    ssr: false,
    prerender: false,
  },
  '/pwa': {
    ssr: false,
  },
  '/docs/**': {
    swr: 3600,
  },
  '/blogs/**': {
    swr: 3600,
  },
  '/_studio/**': {
    ssr: true,
  },
  '/__nuxt_studio/**': {
    ssr: true,
  },
  '/admin/studio/login': {
    ssr: true,
    index: false, // Prevent index.html generation
  },
  '/admin/studio/login/**': {
    ssr: true,
    index: false,
  },
  // Directory-level redirects are auto-generated from .navigation.yml files
  // by the ~/modules/navigation-redirects module at build time
}
