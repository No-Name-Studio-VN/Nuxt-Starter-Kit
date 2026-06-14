import { APP_MANIFEST } from '#shared/constants/manifest'
import { setupTotpSchema } from '#shared/schemas/userSecuritySchema'
import type { TwoFactorSetupPayload } from '~~/types/userSecurity'
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse'
import { getAuthorizedUserId } from '~~/server/utils/authorization'
import userService from '~~/server/utils/database/user'
import userTwoFactorService from '~~/server/utils/database/userTwoFactor'
import { createTotpUri, generateTotpSecret } from '~~/server/utils/totp'

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event)

  const result = await readValidatedBody(event, body => setupTotpSchema.safeParse(body))
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. Invalid format.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    })
  }

  const user = await userService.getById(userId)
  if (!user) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'Not Found. User not found.',
      code: 'USER_NOT_FOUND',
    })
  }

  const isPasswordValid = await verifyPassword(user.password, result.data.password)
  if (!isPasswordValid) {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Unauthorized. Incorrect password.',
      code: 'INVALID_PASSWORD',
    })
  }

  const existing = await userTwoFactorService.getByUserId(userId)
  if (existing?.totpEnabled) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. 2FA is already enabled. Disable it first.',
      code: 'TWO_FACTOR_ALREADY_ENABLED',
    })
  }

  const secret = generateTotpSecret()
  const uri = createTotpUri({ issuer: APP_MANIFEST.name, label: user.username, secret })

  await userTwoFactorService.upsert({
    userId,
    totpSecret: secret,
    totpEnabled: false,
    backupCodes: null,
    failedAttempts: 0,
    lastFailedAttempt: null,
  })

  const response: TwoFactorSetupPayload = { uri, secret }
  return success(response)
})
