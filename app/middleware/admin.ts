export default defineNuxtRouteMiddleware((to) => {
  const { user } = useUserSession()

  if (!user.value?.isAdmin) {
    return navigateTo({
      path: '/auth/login',
      query: {
        redirectTo: to.fullPath,
      },
    })
  }
})
