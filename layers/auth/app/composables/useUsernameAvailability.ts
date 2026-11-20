import { usernameSchema } from '#layers/auth/shared/schemas/userSchema';
import { authRoutes } from '#layers/auth/shared/authRoutes';
import type { UsernameAvailabilityData } from '#layers/auth/types/models/profile';
import { apiRequest } from '#layers/server-core/app/utils/apiRequest';
import type { ApiResponse } from '#layers/server-core/types/api';

export function useUsernameAvailability(username: () => string, savedUsername: () => string) {
  const candidate = computed(() => {
    const parsed = usernameSchema.safeParse(username());
    return parsed.success ? parsed.data : null;
  });
  const availability = ref<'checking' | 'available' | 'taken' | 'invalid' | 'failed'>('invalid');
  const retryCount = ref(0);

  function retry() {
    retryCount.value++;
  }

  watch([candidate, savedUsername, retryCount], ([username, saved], _, onCleanup) => {
    if (!username) {
      availability.value = 'invalid';
      return;
    }
    if (username === saved) {
      availability.value = 'available';
      return;
    }

    availability.value = 'checking';
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const response = await apiRequest<ApiResponse<UsernameAvailabilityData>>(authRoutes.USERNAME_AVAILABILITY, {
          query: { username },
          signal: controller.signal,
        });
        if (!response.success) throw response;
        if (!controller.signal.aborted) {
          availability.value = response.data.available ? 'available' : 'taken';
        }
      } catch {
        if (!controller.signal.aborted) availability.value = 'failed';
      }
    }, 300);

    onCleanup(() => {
      clearTimeout(timeout);
      controller.abort();
    });
  }, { immediate: true, flush: 'sync' });

  return { candidate, availability, retry };
}
