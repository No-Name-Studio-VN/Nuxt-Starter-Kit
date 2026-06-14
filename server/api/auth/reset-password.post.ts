import { AuthTokenType } from '#shared/commonEnums'
import { resetPasswordSchema } from '#shared/schemas/userSchema'
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse'
import authTokenService from '~~/server/utils/database/authToken'
import userService from '~~/server/utils/database/user'

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, body => resetPasswordSchema.safeParse(body))
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Please check your input and try again.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    })
  }

  const tokenRecord = await authTokenService.verifyToken(result.data.token, AuthTokenType.PasswordReset)
  if (!tokenRecord) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'The reset link is invalid or has expired.',
      code: 'RESET_TOKEN_INVALID',
    })
  }

  const user = await userService.getById(tokenRecord.userId)
  if (!user) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'User not found.',
      code: 'USER_NOT_FOUND',
    })
  }

  const hashedPassword = await hashPassword(result.data.password)

  await userService.update({ id: user.id, password: hashedPassword, emailVerified: true })
  await authTokenService.markUsed(tokenRecord.id)
  await authTokenService.invalidateUserTokens(user.id, AuthTokenType.PasswordReset)
  await authTokenService.invalidateUserTokens(user.id, AuthTokenType.EmailVerification)

  return success({})
})
