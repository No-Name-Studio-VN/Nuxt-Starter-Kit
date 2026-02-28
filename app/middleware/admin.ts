export default defineNuxtRouteMiddleware(() => {
  const { user } = useUserSession()

  if (!user.value?.isAdmin) {
    return createError({
      statusCode: 403,
      statusMessage: 'Forbidden',
    })
  }
})
