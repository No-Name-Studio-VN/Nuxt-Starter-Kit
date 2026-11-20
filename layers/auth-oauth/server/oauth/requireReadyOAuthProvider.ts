import type { H3Event } from 'h3';
import { useRuntimeConfig as useNuxtRuntimeConfig, type RequestEvent } from 'nuxt/server';
import { apiError } from '#layers/server-core/server/utils/apiResponse';
import { getOAuthReadiness } from './readiness';
import { oauthProviders } from './registry';

export function requireReadyOAuthProvider(event: H3Event | RequestEvent, provider: string) {
  const config = 'url' in event ? useNuxtRuntimeConfig() : useRuntimeConfig(event);
  const id = getOAuthReadiness(config).ready.find((id) => id === provider);
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
