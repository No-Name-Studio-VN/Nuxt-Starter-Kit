import { AuthTokenType } from '#shared/commonEnums'
import { forgotPasswordSchema } from '#shared/schemas/userSchema'
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse'
import authTokenService from '~~/server/utils/database/authToken'
import userService from '~~/server/utils/database/user'
import { sendPasswordResetEmail } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, body => forgotPasswordSchema.safeParse(body))
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Valid email and security verification are required.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    })
  }

  const tokenValidation = await verifyTurnstileToken(result.data['cf-turnstile-response'])
  if (!tokenValidation.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Security verification failed. Please try again.',
      code: 'CAPTCHA_VERIFICATION_FAILED',
    })
  }

  const user = await userService.getByEmail(result.data.email)

  if (!user) {
    return success({})
  }

  const hasRecent = await authTokenService.hasRecentToken(user.id, AuthTokenType.PasswordReset)
  if (hasRecent) {
    return success({})
  }

  await authTokenService.invalidateUserTokens(user.id, AuthTokenType.PasswordReset)
  const token = await authTokenService.createToken(user.id, AuthTokenType.PasswordReset)
  await sendPasswordResetEmail(event, user.email, user.username, token)

  return success({})
})
