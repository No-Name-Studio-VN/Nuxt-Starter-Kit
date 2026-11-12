/** Keeps signed-in users off pages meant for guests (sign-in, registration, ...). */
export default defineNuxtRouteMiddleware(() => {
  const { loggedIn } = useUserSession();
  if (!loggedIn.value) {
    return;
  }

  return navigateTo('/');
});
