import type { OAuthProviderId } from '../types/providers';

export const oauthRoutes = {
  POPUP: '/auth/oauth/popup',
  PROVIDERS: '/api/auth/oauth/providers',
  URL: '/api/auth/oauth/url',
  UNLINK: '/api/auth/oauth/unlink',
  GOOGLE_ONE_TAP: '/api/auth/google-one-tap',
  provider: (provider: OAuthProviderId) => `/api/auth/${provider}`,
};
