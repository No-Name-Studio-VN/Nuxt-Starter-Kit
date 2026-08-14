const ignoredPaths = [
  '/auth/login',
  '/auth/register',
  '/auth/verify-email',
  '/auth/forgot-password',
  '/auth/reset-password',
];

export default defineNuxtRouteMiddleware((to) => {
  if (ignoredPaths.includes(to.path)) {
    const { loggedIn } = useUserSession();
    if (!loggedIn.value) {
      return;
    }

    return navigateTo('/');
  }
});
