import { AuthTokenType } from '#shared/commonEnums'
import { registerUserSchema } from '#shared/schemas/userSchema'
import userService from '~~/server/utils/database/user'
import authTokenService from '~~/server/utils/database/authToken'
import { sendVerificationEmail } from '~~/server/utils/email'
import { safeRedirectPath } from '~~/server/utils/safeRedirect'
import { apiRoutes } from '#shared/apiRoutes'
import type { User } from '#shared/db'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, body => registerUserSchema.safeParse(body))
  if (!result.success) {
    return sendRedirect(event, apiRoutes.AUTH_REGISTER + '?error=validation')
  }

  const { username, password, 'cf-turnstile-response': token } = result.data

  const tokenValidation = await verifyTurnstileToken(token)
  if (!tokenValidation.success) {
    return sendRedirect(event, apiRoutes.AUTH_REGISTER + '?error=captcha')
  }

  const redirectTo = safeRedirectPath(event, result.data['redirect-to'])

  const [existingUsername, existingEmail] = await Promise.all([
    userService.getByUsername(username),
    userService.getByEmail(result.data.email),
  ])

  if (existingUsername) {
    return sendRedirect(event, apiRoutes.AUTH_REGISTER + '?error=existed')
  }
  if (existingEmail) {
    return sendRedirect(event, apiRoutes.AUTH_REGISTER + '?error=email-existed')
  }

  const hashedPassword = await hashPassword(password)

  let newUser: User
  try {
    newUser = await userService.create({
      username: result.data.username,
      email: result.data.email,
      name: result.data.name,
      password: hashedPassword,
      emailVerified: false,
      isAdmin: false,
    })
  }
  catch (err: unknown) {
    let errorCode: string | undefined
    let errorMessage: string | undefined
    let causeMessage: string | undefined

    if (isRecord(err)) {
      errorCode = readStringField(err, 'code')
      errorMessage = readStringField(err, 'message')
      const cause = err.cause
      if (isRecord(cause)) {
        causeMessage = readStringField(cause, 'message')
      }
    }

    const isUniqueConstraint = errorCode === 'SQLITE_CONSTRAINT' || errorCode === 'SQLITE_CONSTRAINT_UNIQUE' || errorMessage?.includes('UNIQUE')
    if (isUniqueConstraint) {
      if (errorMessage?.includes('email') || causeMessage?.includes('email')) {
        return sendRedirect(event, apiRoutes.AUTH_REGISTER + '?error=email-existed')
      }
      return sendRedirect(event, apiRoutes.AUTH_REGISTER + '?error=existed')
    }
    throw err
  }

  const verificationToken = await authTokenService.createToken(newUser.id, AuthTokenType.EmailVerification)
  const verificationEmail = await sendVerificationEmail(event, newUser.email, newUser.username, verificationToken)

  if (!verificationEmail.configured) {
    await userService.update({ id: newUser.id, emailVerified: true })
    return sendRedirect(event, `${apiRoutes.AUTH_LOGIN}?success=account-ready&redirectTo=${encodeURIComponent(redirectTo)}`)
  }

  if (!verificationEmail.sent) {
    return sendRedirect(event, `${apiRoutes.AUTH_VERIFY_EMAIL}?email=${encodeURIComponent(newUser.email)}&redirectTo=${encodeURIComponent(redirectTo)}&error=email-send-failed`)
  }

  return sendRedirect(event, `${apiRoutes.AUTH_VERIFY_EMAIL}?email=${encodeURIComponent(newUser.email)}&redirectTo=${encodeURIComponent(redirectTo)}`)
})
