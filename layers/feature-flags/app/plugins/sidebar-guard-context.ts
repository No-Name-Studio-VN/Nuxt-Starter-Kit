import { SIDEBAR_GUARD_CONTEXT_KEY } from '@/constants/sidebar';

/**
 * Gives the sidebar guards the live flag values of the signed-in user. Runs on the
 * server too, so the flags are fetched while rendering as well as polled in the browser.
 */
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.provide(SIDEBAR_GUARD_CONTEXT_KEY, () => {
    const { flags } = useFeatureFlags();
    return computed(() => ({ flags: flags.value }));
  });
});
