import { authRoutes } from '#layers/auth/shared/authRoutes';
import type { OAuthProvidersPayload } from '#layers/auth/types/auth';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import type { ApiResponse } from '#layers/server-core/types/api';

export function useOAuthProviders() {
  return useLazyAsyncData('auth:oauth-providers', async (_nuxtApp, { signal }) => {
    try {
      const response = await apiRequest<ApiResponse<OAuthProvidersPayload>>(
        authRoutes.AUTH_OAUTH_PROVIDERS,
        { signal },
      );
      if (!response.success) throw response;
      return response.data.providers;
    } catch (error) {
      const parsed = parseApiError(error);
      throw createError({ statusCode: parsed.status, message: parsed.message });
    }
  }, { server: false, default: () => [] });
}
