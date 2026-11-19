import type { OAuthProvider, OAuthProviderId } from '../../types/providers';
import discord from './providers/discord';
import github from './providers/github';
import google from './providers/google';
import oidc from './providers/oidc';

export const oauthProviders = {
  [discord.id]: discord,
  [github.id]: github,
  [google.id]: google,
  [oidc.id]: oidc,
} satisfies { [Id in OAuthProviderId]: OAuthProvider<Id> };

export function isOAuthProviderId(id: string): id is OAuthProviderId {
  return Object.hasOwn(oauthProviders, id);
}
