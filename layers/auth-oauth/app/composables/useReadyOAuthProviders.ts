import { oauthRoutes } from '#layers/auth-oauth/shared/oauthRoutes';
import type { OAuthProviderId } from '#layers/auth-oauth/types/providers';
import type { ApiResponse } from '#layers/server-core/types/api';

export function useReadyOAuthProviderList() {
  const { data, status, refresh } = useFetch<ApiResponse<OAuthProviderId[]>>(oauthRoutes.PROVIDERS, {
    key: oauthRoutes.PROVIDERS,
  });
  const providers = computed(() => (data.value?.success ? data.value.data : []));
  return { providers, status, refresh };
}

export function useReadyOAuthProviders() {
  return useReadyOAuthProviderList().providers;
}
