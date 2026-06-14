import { AuthTokenType } from '#shared/commonEnums'
import { resendVerificationSchema } from '#shared/schemas/userSchema'
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse'
import authTokenService from '~~/server/utils/database/authToken'
import userService from '~~/server/utils/database/user'
import { sendVerificationEmail } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, body => resendVerificationSchema.safeParse(body))
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Valid email is required.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    })
  }

  const user = await userService.getByEmail(result.data.email)

  if (!user || user.emailVerified) {
    return success({})
  }

  const hasRecent = await authTokenService.hasRecentToken(user.id, AuthTokenType.EmailVerification)
  if (hasRecent) {
    throw apiError({
      status: 429,
      statusText: 'Too Many Requests',
      message: 'A verification email was recently sent. Please wait a moment before requesting another.',
      code: 'VERIFICATION_EMAIL_RATE_LIMITED',
    })
  }

  await authTokenService.invalidateUserTokens(user.id, AuthTokenType.EmailVerification)
  const token = await authTokenService.createToken(user.id, AuthTokenType.EmailVerification)
  const verificationEmail = await sendVerificationEmail(event, user.email, user.username, token)

  if (!verificationEmail.configured) {
    await userService.update({ id: user.id, emailVerified: true })
  }

  if (verificationEmail.configured && !verificationEmail.sent) {
    throw apiError({
      status: 502,
      statusText: 'Bad Gateway',
      message: 'Verification email could not be sent. Please try again later.',
      code: 'EMAIL_SEND_FAILED',
    })
  }

  return success({})
})
