import { apiRoutes } from '#shared/apiRoutes';
import type { ApiResponse } from '~~/types/api';

type FeatureFlags = Record<string, boolean>;
type FeatureFlagsResponse = ApiResponse<FeatureFlags>;

/** How often to poll the `/api/flags` edge endpoint (ms). */
const POLLING_INTERVAL_MS = 30_000;

/** BroadcastChannel name used to sync flags across tabs. */
const FLAGS_BROADCAST_CHANNEL = 'feature-flags-sync';

function createFeatureFlagsResponse(data: FeatureFlags = {}): FeatureFlagsResponse {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

function getFeatureFlags(response: FeatureFlagsResponse | undefined): FeatureFlags {
  if (response?.success) {
    return response.data;
  }

  return {};
}

/**
 * SSR-safe composable to access feature flag values with **real-time updates**.
 *
 * Architecture:
 * 1. **SSR Hydration** — Flags are fetched server-side during SSR (no flicker).
 * 2. **Edge Polling** — On the client, flags are silently re-fetched from
 *    Cloudflare KV every ~15 seconds via `useIntervalFn`.
 * 3. **Visibility Optimization** — Polling pauses when the tab is hidden
 *    (`document.visibilityState === 'hidden'`) and triggers an immediate
 *    refresh when the tab regains focus.
 * 4. **Cross-Tab Broadcast** — When flags update in one tab, the new values
 *    are broadcast to all other open tabs via `BroadcastChannel`, so they
 *    react instantly without making their own network requests.
 *
 * @example
 * ```vue
 * <script setup>
 * const { flags, isEnabled, refresh } = useFeatureFlags()
 *
 * // Check a specific flag
 * const showNewReader = isEnabled('new-reader-v2')
 * </script>
 *
 * <template>
 *   <NewReaderV2 v-if="showNewReader" />
 *   <OldReader v-else />
 * </template>
 * ```
 */
export function useFeatureFlags() {
  const { data, refresh, status } = useAPI<FeatureFlagsResponse>(apiRoutes.FLAGS_EVALUATE, {
    key: 'feature-flags',
    default: () => createFeatureFlagsResponse(),
    getCachedData: (key, nuxtApp) => {
      // Only return cached payload data during initial hydration.
      // On subsequent fetches (polling, manual refresh), return undefined
      // so the actual network request proceeds with fresh data.
      // Optional chaining is required because prerendered/client-only pages
      // (e.g. /pwa) may not have payload.data or static.data populated.
      if (nuxtApp.isHydrating) {
        return nuxtApp.payload?.data?.[key] ?? nuxtApp.static?.data?.[key];
      }
    },
  });

  // ── Reactive flag map ───────────────────────────────────────────
  const flags = computed(() => getFeatureFlags(data.value));

  // ── Real-time updates (client-only) ─────────────────────────────
  // onMounted guarantees this only runs on the client after hydration.
  // useState guard prevents duplicate intervals when multiple components
  // call useFeatureFlags().
  const pollingInit = useState('_ff-polling-init', () => false);
  onMounted(() => {
    if (!pollingInit.value) {
      pollingInit.value = true;
      _useRealtimePolling(data, refresh);
    }
  });

  /**
   * Check if a specific flag is enabled.
   * Returns a computed ref that automatically updates when flags change.
   *
   * @param key - The flag key (e.g., 'new-reader-v2')
   * @param defaultValue - Value to return if the flag is unknown (default: false)
   */
  function isEnabled(key: string, defaultValue = false) {
    return computed(() => flags.value[key] ?? defaultValue);
  }

  return {
    /** All flag values as a reactive Record<string, boolean> */
    flags,
    /** Check if a specific flag is enabled */
    isEnabled,
    /** Re-fetch flag evaluations from the server */
    refresh,
    /** Loading status */
    status,
  };
}

// ── Internal: Real-time polling + cross-tab sync ──────────────────
// Extracted to keep the main composable body clean.

/**
 * Sets up client-side edge-polling, visibility-aware pausing,
 * and BroadcastChannel cross-tab synchronization.
 *
 * This function is only called on the client (`import.meta.client`).
 */
function _useRealtimePolling(
  data: Ref<FeatureFlagsResponse | undefined>,
  refresh: () => Promise<void>,
) {
  // ── 1. BroadcastChannel — cross-tab sync ──────────────────────
  const {
    data: broadcastData,
    post: broadcastPost,
    isSupported: isBroadcastSupported,
  } = useBroadcastChannel<Record<string, boolean>, Record<string, boolean>>({
    name: FLAGS_BROADCAST_CHANNEL,
  });

  // When another tab sends an update, apply it locally
  watch(broadcastData, (incoming) => {
    if (incoming && typeof incoming === 'object') {
      data.value = createFeatureFlagsResponse(incoming);
    }
  });

  // ── 2. Visibility-aware edge polling ──────────────────────────
  const visibility = useDocumentVisibility();

  // Track the previous data snapshot to detect actual changes
  let lastFlagSnapshot = JSON.stringify(getFeatureFlags(data.value));

  /**
   * Silently poll the edge and broadcast changes to other tabs.
   * Only triggers a broadcast when the flag values actually changed,
   * preventing unnecessary cross-tab updates.
   */
  async function pollAndBroadcast() {
    await refresh();

    const currentSnapshot = JSON.stringify(getFeatureFlags(data.value));
    if (currentSnapshot !== lastFlagSnapshot) {
      lastFlagSnapshot = currentSnapshot;
      // Broadcast the new flag values to all other tabs
      if (isBroadcastSupported.value) {
        broadcastPost(getFeatureFlags(data.value));
      }
    }
  }

  // Periodic polling — runs every POLLING_INTERVAL_MS
  const { pause, resume } = useIntervalFn(
    pollAndBroadcast,
    POLLING_INTERVAL_MS,
    { immediate: true }, // Start polling immediately after mount
  );

  // ── 3. Visibility optimization ────────────────────────────────
  // Pause polling when the tab is hidden, force-refresh when it's visible again
  watch(visibility, (state) => {
    if (state === 'hidden') {
      pause();
    } else {
      // Tab became visible — immediately refresh (data may be stale) then resume
      pollAndBroadcast();
      resume();
    }
  });
}
