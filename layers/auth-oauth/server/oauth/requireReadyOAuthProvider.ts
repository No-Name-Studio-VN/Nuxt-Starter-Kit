import type { H3Event } from 'h3';
import { apiError } from '#layers/server-core/server/utils/apiResponse';
import { getOAuthReadiness } from './readiness';
import { oauthProviders } from './registry';

export function requireReadyOAuthProvider(event: H3Event, provider: string) {
  const id = getOAuthReadiness(useRuntimeConfig(event)).ready.find((id) => id === provider);
  if (!id) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'This OAuth provider is not available.',
      code: 'OAUTH_PROVIDER_ERROR',
    });
  }
  return oauthProviders[id];
}
