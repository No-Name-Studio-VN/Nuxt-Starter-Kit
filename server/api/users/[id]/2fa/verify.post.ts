import { verifyTotpSchema } from '#shared/schemas/userSecuritySchema'
import type { TwoFactorVerifyPayload } from '~~/types/userSecurity'
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse'
import { getAuthorizedUserId } from '~~/server/utils/authorization'
import userTwoFactorService from '~~/server/utils/database/userTwoFactor'
import { generateBackupCodes, verifyTotpCode } from '~~/server/utils/totp'

export default defineEventHandler(async (event) => {
  const userId = await getAuthorizedUserId(event)
  const result = await readValidatedBody(event, body => verifyTotpSchema.safeParse(body))
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. Invalid format.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    })
  }

  const twoFactor = await userTwoFactorService.getByUserId(userId)

  if (!twoFactor || !twoFactor.totpSecret) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'Not Found. No 2FA setup started.',
      code: 'TWO_FACTOR_SETUP_NOT_FOUND',
    })
  }

  const isValid = await verifyTotpCode(twoFactor.totpSecret, result.data.code)
  if (!isValid) {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Unauthorized. The authenticator code you entered is incorrect.',
      code: 'INVALID_TWO_FACTOR_CODE',
    })
  }

  const backupCodes = generateBackupCodes()
  const hashedBackupCodes = await Promise.all(backupCodes.map(code => hashPassword(code)))

  await userTwoFactorService.update({
    userId,
    totpEnabled: true,
    backupCodes: hashedBackupCodes,
    failedAttempts: 0,
    lastFailedAttempt: null,
  })

  const response: TwoFactorVerifyPayload = { backupCodes }
  return success(response)
})
