import { authRoutes } from '../authRoutes';
import type { OAuthProviderConfig } from '../../types/auth';

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  google: {
    id: 'google',
    name: 'Google',
    route: authRoutes.AUTH_GOOGLE,
  },
} as const;

export const AVAILABLE_PROVIDERS = Object.values(OAUTH_PROVIDERS);
