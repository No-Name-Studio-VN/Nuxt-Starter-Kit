import { computed, ref } from 'vue';
import type { ComputedRef } from 'vue';

import { parseApiError } from '@/utils/apiError';

export interface RequestState {
  /** User-facing reason the request failed, or null while it has not failed. */
  errorMessage: ComputedRef<string | null>;
  hasFailed: ComputedRef<boolean>;
  fail: (error: unknown, fallbackMessage: string) => void;
  clear: () => void;
  retry: () => Promise<void>;
}

/**
 * Tracks whether a request failed and how to run it again.
 *
 * Deliberately does not wrap fetching: `parseApiError` normalizes every failure
 * shape the app produces (ofetch errors, `success: false` envelopes, thrown
 * Errors), so the same state works for `useAPI` calls and hand-rolled
 * `apiRequest` calls alike.
 *
 * @param retry - Re-runs the request this state belongs to.
 */
export function useRequestState(retry: () => Promise<void> | void): RequestState {
  const errorMessage = ref<string | null>(null);

  /**
   * Record a failure from any source.
   *
   * @param error - The rejected value, response body, or thrown error.
   * @param fallbackMessage - Used when the failure carries no message of its own.
   *   Passed per call rather than per instance because one state can be fed by
   *   several requests that each need their own wording.
   */
  function fail(error: unknown, fallbackMessage: string): void {
    errorMessage.value = parseApiError(error, fallbackMessage).message;
  }

  function clear(): void {
    errorMessage.value = null;
  }

  /** Clears the failure first so the error state does not linger during the retry. */
  async function retryRequest(): Promise<void> {
    clear();
    await retry();
  }

  return {
    errorMessage: computed(() => errorMessage.value),
    hasFailed: computed(() => errorMessage.value !== null),
    fail,
    clear,
    retry: retryRequest,
  };
}
