import { until } from '@vueuse/core';
import { DEFAULT_USER_ID } from '@/constants/pref';

/**
 * Guard against a session request that never settles. `useUserSession().fetch()`
 * flips `ready` even when the request fails, so this only fires if the response
 * itself hangs — in which case falling back to the anonymous id beats blocking
 * the caller forever.
 */
const SESSION_READY_TIMEOUT_MS = 5000;

export function getCurrentUserId() {
  const { user } = useUserSession();
  return user.value?.id ?? DEFAULT_USER_ID;
}

/**
 * Current user id, awaited until the session has actually been resolved.
 *
 * On server-rendered routes the session lands during SSR, so `getCurrentUserId()`
 * is already correct by the time a component mounts. Prerendered routes have no
 * session at build time — nuxt-auth-utils only fetches it on `app:mounted` — so
 * reading the id straight away races that fetch and silently reads the anonymous
 * user's local data. Use this in any client-side load that keys off the user.
 */
export async function resolveCurrentUserId() {
  const { ready } = useUserSession();

  if (!ready.value) {
    await until(ready).toBe(true, { timeout: SESSION_READY_TIMEOUT_MS });
  }

  return getCurrentUserId();
}
