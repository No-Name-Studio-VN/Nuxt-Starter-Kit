import { MAX_TOTP_ATTEMPTS, TOTP_ATTEMPT_RESET_MS } from '#shared/constants/totp'
import { loginTwoFactorSchema } from '#shared/schemas/userSecuritySchema'
import type { LoginTwoFactorValidationPayload } from '~~/types/userSecurity'
import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse'
import userService from '~~/server/utils/database/user'
import userTwoFactorService from '~~/server/utils/database/userTwoFactor'
import { verifyTotpCode } from '~~/server/utils/totp'

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, body => loginTwoFactorSchema.safeParse(body))
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. Invalid code format.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    })
  }

  const session = await getUserSession(event)
  const userId = session.secure?.pending2faUserId
  if (typeof userId !== 'number') {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Session expired or invalid. Please log in again.',
      code: 'SESSION_INVALID',
    })
  }

  const twoFactor = await userTwoFactorService.getByUserId(userId)
  if (!twoFactor || !twoFactor.totpEnabled || !twoFactor.totpSecret) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: '2FA is not enabled for this account.',
      code: 'TWO_FACTOR_NOT_ENABLED',
    })
  }

  const lastFailedAttempt = twoFactor.lastFailedAttempt
  const attemptsAreFresh = !!lastFailedAttempt && Date.now() - lastFailedAttempt.getTime() < TOTP_ATTEMPT_RESET_MS
  const failedAttempts = attemptsAreFresh ? twoFactor.failedAttempts : 0

  if (failedAttempts >= MAX_TOTP_ATTEMPTS) {
    throw apiError({
      status: 429,
      statusText: 'Too Many Requests',
      message: 'Too Many Requests. Maximum authenticator code verification attempts exceeded.',
      code: 'TOTP_ATTEMPT_LIMIT_EXCEEDED',
    })
  }

  const { code } = result.data
  let isCorrect = await verifyTotpCode(twoFactor.totpSecret, code)
  let backupCodes = twoFactor.backupCodes ?? []

  if (!isCorrect && backupCodes.length > 0) {
    const backupIndex = await findMatchingBackupCodeIndex(backupCodes, code)
    if (backupIndex !== -1) {
      isCorrect = true
      backupCodes = backupCodes.filter((_, index) => index !== backupIndex)
      await userTwoFactorService.update({ userId, backupCodes })
    }
  }

  if (!isCorrect) {
    const nextFailedAttempts = failedAttempts + 1
    await userTwoFactorService.update({
      userId,
      failedAttempts: nextFailedAttempts,
      lastFailedAttempt: new Date(),
    })

    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Unauthorized. The 2FA code you entered is incorrect.',
      code: 'INVALID_TWO_FACTOR_CODE',
      details: { valid: false, remainingAttempts: MAX_TOTP_ATTEMPTS - nextFailedAttempts },
    })
  }

  await userTwoFactorService.update({
    userId,
    failedAttempts: 0,
    lastFailedAttempt: null,
  })

  const user = await userService.getById(userId)
  if (!user) {
    throw apiError({
      status: 404,
      statusText: 'Not Found',
      message: 'User not found.',
      code: 'USER_NOT_FOUND',
    })
  }

  await userService.update({ id: user.id, lastLoginAt: new Date() })
  await setUserSession(event, {
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      isAdmin: user.isAdmin,
    },
    secure: {},
  })

  const response: LoginTwoFactorValidationPayload = { valid: true }
  return success(response)
})

async function findMatchingBackupCodeIndex(backupCodes: string[], code: string): Promise<number> {
  for (const [index, backupCodeHash] of backupCodes.entries()) {
    const isMatch = await verifyPassword(backupCodeHash, code.toUpperCase())
    if (isMatch) return index
  }

  return -1
}
