import type { OAuthProviderInfo } from '#layers/auth/types/auth';

export const oauthProviderInfo = {
  google: { id: 'google', name: 'Google', icon: 'google' },
  github: { id: 'github', name: 'GitHub', icon: 'github' },
  discord: { id: 'discord', name: 'Discord', icon: 'discord' },
} satisfies Record<string, OAuthProviderInfo>;

export function getOAuthProviderInfo(id: string): OAuthProviderInfo {
  return Object.values(oauthProviderInfo).find((provider) => provider.id === id) ?? { id, name: id, icon: id };
}
