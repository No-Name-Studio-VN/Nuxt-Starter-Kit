import { updateProfileSchema } from '#shared/schemas/userSchema'
import { AuthTokenType } from '#shared/commonEnums'
import userService from '~~/server/utils/database/user'
import authTokenService from '~~/server/utils/database/authToken'
import { getAuthorizedUserId } from '~~/server/utils/authorization'
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse'
import { sendVerificationEmail } from '~~/server/utils/email'

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event)
  const currentUser = await userService.getById(userId)

  if (!currentUser) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'User not found.',
      code: 'USER_NOT_FOUND',
    })
  }

  const result = await readValidatedBody(event, body => updateProfileSchema.safeParse(body))
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. The submitted profile data is invalid.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    })
  }

  // Check if email is already taken by another user
  const existingUser = await userService.getByEmail(result.data.email)
  if (existingUser && existingUser.id !== userId) {
    throw apiError({
      status: 409,
      statusText: 'Conflict',
      message: 'Conflict. This email address is already associated with another account.',
      code: 'EMAIL_ALREADY_EXISTS',
    })
  }

  const emailChanged = result.data.email !== currentUser.email
  let emailVerified = currentUser.emailVerified

  if (emailChanged) {
    await authTokenService.invalidateUserTokens(currentUser.id, AuthTokenType.EmailVerification)
    const verificationToken = await authTokenService.createToken(currentUser.id, AuthTokenType.EmailVerification)
    const verificationEmail = await sendVerificationEmail(event, result.data.email, currentUser.username, verificationToken)

    if (!verificationEmail.configured) {
      emailVerified = true
    }
    else if (verificationEmail.sent) {
      emailVerified = false
    }
    else {
      await authTokenService.invalidateUserTokens(currentUser.id, AuthTokenType.EmailVerification)
      throw apiError({
        status: 502,
        statusText: 'Bad Gateway',
        message: 'Verification email could not be sent. Please try again later.',
        code: 'EMAIL_SEND_FAILED',
      })
    }
  }

  const updatedUser = await userService.update({
    id: userId,
    name: result.data.name,
    email: result.data.email,
    emailVerified,
  })

  if (!updatedUser) {
    throw apiError({
      status: 500,
      statusText: 'Internal Server Error',
      message: 'Internal Server Error. Failed to update the user profile.',
      code: 'PROFILE_UPDATE_FAILED',
    })
  }

  return success({
    id: updatedUser.id,
    username: updatedUser.username,
    name: updatedUser.name,
    email: updatedUser.email,
    emailVerified,
  })
})
