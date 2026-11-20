import { getOnboardingRouteLocale, resolveOnboardingRedirect } from '../utils/onboardingRedirect';

export default defineNuxtRouteMiddleware(async (to) => {
  const { loggedIn, user, ready, fetch } = useUserSession();
  const routeBaseName = useRouteBaseName();
  const localePath = useAppLocalePath();
  const nuxtApp = useNuxtApp();

  // Match auth-utils: never include a user-specific redirect in a shared response.
  if (import.meta.server && (nuxtApp.payload.prerenderedAt || nuxtApp.payload.isCached)) return;

  if (!ready.value) await fetch();
  const name = routeBaseName(to);
  const redirect = resolveOnboardingRedirect(
    to.path,
    typeof name === 'string' ? name : undefined,
    loggedIn.value && user.value?.onboardingPending === true,
  );

  if (redirect) {
    // The locale middleware may not have switched to the incoming route's locale yet.
    const targetLocale = to.meta.localeIndependent === true
      ? nuxtApp.$i18n.locale.value
      : getOnboardingRouteLocale(to.path);
    const destination = localePath(redirect, targetLocale);
    return nuxtApp.runWithContext(() => navigateTo(destination, { replace: true }));
  }
});
