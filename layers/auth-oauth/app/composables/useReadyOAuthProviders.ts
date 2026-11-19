import { oauthRoutes } from '#layers/auth-oauth/shared/oauthRoutes';
import type { OAuthProviderId } from '#layers/auth-oauth/types/providers';
import type { ApiResponse } from '#layers/server-core/types/api';

export function useReadyOAuthProviders() {
  const { data } = useFetch<ApiResponse<OAuthProviderId[]>>(oauthRoutes.PROVIDERS, {
    key: oauthRoutes.PROVIDERS,
  });
  return computed(() => (data.value?.success ? data.value.data : []));
}
