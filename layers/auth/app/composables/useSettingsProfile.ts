import { authRoutes } from '#layers/auth/shared/authRoutes';
import type { UserProfileModel } from '#layers/auth/types/models/profile';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import { parseApiError } from '#layers/server-core/app/utils/apiError';
import type { ApiResponse } from '#layers/server-core/types/api';

export function useSettingsProfile() {
  const { user } = useUserSession();
  const fetchProfile = import.meta.server ? useRequestFetch() : apiRequest;

  return useLazyAsyncData(() => `settings:profile:${user.value?.id}`, async (_nuxtApp, { signal }) => {
    try {
      const response = await fetchProfile<ApiResponse<UserProfileModel>>(authRoutes.MY_PROFILE, { signal });
      if (!response.success) throw response;
      return response.data;
    } catch (error) {
      throw createError({ statusCode: parseApiError(error).status });
    }
  });
}
