export default defineNuxtRouteMiddleware((to) => {
  const { loggedIn } = useUserSession();

  if (!loggedIn.value) {
    const localePath = useAppLocalePath();
    return navigateTo({
      path: localePath('/auth/login'),
      query: {
        redirectTo: to.fullPath,
      },
    });
  }
});
