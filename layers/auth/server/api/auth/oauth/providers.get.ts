import { getEnabledOAuthProviders } from '#layers/auth/server/utils/oauthProviders';
import type { OAuthProvidersPayload } from '#layers/auth/types/auth';
import { success } from '#layers/server-core/server/utils/apiResponse';

export default defineEventHandler(() => {
  const providers = getEnabledOAuthProviders(useRuntimeConfig()).map(({ id, name, icon }) => ({
    id,
    name,
    icon,
  }));
  return success<OAuthProvidersPayload>({ providers });
});
