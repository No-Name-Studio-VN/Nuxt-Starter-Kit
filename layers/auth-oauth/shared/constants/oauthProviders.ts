import type { OAuthProviderDisplay } from '../../types/providers';

export const OAUTH_PROVIDERS = {
  google: { label: 'Google', icon: 'google' },
  github: { label: 'GitHub', icon: 'github' },
  discord: { label: 'Discord', icon: 'discord' },
  oidc: { label: 'SSO', icon: 'key-round' },
} satisfies Record<string, OAuthProviderDisplay>;
