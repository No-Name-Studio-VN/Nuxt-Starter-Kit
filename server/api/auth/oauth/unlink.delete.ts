import { oauthUnlinkBodySchema } from '#shared/schemas/userSchema'
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse'
import oauthAccountService from '~~/server/utils/database/oauthAccount'
import userService from '~~/server/utils/database/user'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const result = await readValidatedBody(event, body => oauthUnlinkBodySchema.safeParse(body))

  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. Invalid OAuth unlink request.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    })
  }

  const { provider } = result.data
  const userId = session.user.id

  const linkedAccount = await oauthAccountService.getByUserAndProvider(userId, provider)
  if (!linkedAccount) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'This provider is not linked to your account.',
      code: 'OAUTH_PROVIDER_NOT_LINKED',
    })
  }

  const dbUser = await userService.getById(userId)
  if (!dbUser) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'User not found.',
      code: 'USER_NOT_FOUND',
    })
  }

  const hasPassword = !!dbUser.password && dbUser.password.trim().length > 0
  const linkedCount = await oauthAccountService.countByUserId(userId)

  if (!hasPassword && linkedCount <= 1) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'You can\'t unlink your only sign-in method. Set a password first.',
      code: 'UNLINK_LAST_AUTH_METHOD',
    })
  }

  await oauthAccountService.unlink(userId, provider)

  return success({ unlinked: true })
})
