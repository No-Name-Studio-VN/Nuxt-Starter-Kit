import {
  oauthProviderListSchema,
  oauthRuntimeCredentialsSchema,
} from '../../shared/schemas/oauthSchema';
import type { OAuthReadiness, OAuthRuntimeConfig } from '../../types/providers';
import { isOAuthProviderId, oauthProviders } from './registry';

export function getOAuthReadiness(config: OAuthRuntimeConfig): OAuthReadiness {
  const configured = config.public.site?.auth?.oauth;
  const list = oauthProviderListSchema.safeParse(configured === undefined ? [] : configured);
  const result: OAuthReadiness = {
    ready: [],
    unknownProviders: [],
    missingCredentials: [],
    invalidList: !list.success,
  };
  if (!list.success) return result;

  const credentials = oauthRuntimeCredentialsSchema.safeParse(config.oauth).data;
  for (const id of new Set(list.data)) {
    if (!isOAuthProviderId(id)) {
      result.unknownProviders.push(id);
    } else if (!oauthProviders[id].credentialsSchema.safeParse(credentials?.[id]).success) {
      result.missingCredentials.push(id);
    } else {
      result.ready.push(id);
    }
  }
  return result;
}
