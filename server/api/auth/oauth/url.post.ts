import { apiError, success, zodErrorToFieldErrors } from '~~/server/utils/apiResponse'
import { OAUTH_PROVIDERS } from '#shared/constants/oauthProviders'
import { oauthUrlBodySchema } from '#shared/schemas/userSchema'

export default defineEventHandler(async (event) => {
  const result = await readValidatedBody(event, body => oauthUrlBodySchema.safeParse(body))
  if (!result.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Bad Request. Invalid OAuth request.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(result.error),
    })
  }

  const { provider, action, redirectTo } = result.data

  if (!Object.prototype.hasOwnProperty.call(OAUTH_PROVIDERS, provider)) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Unsupported OAuth provider.',
      code: 'UNSUPPORTED_OAUTH_PROVIDER',
    })
  }

  const providerConfig = OAUTH_PROVIDERS[provider]
  const route = action === 'link' ? `${providerConfig.route}?action=link` : providerConfig.route
  const url = redirectTo ? `${route}${route.includes('?') ? '&' : '?'}redirectTo=${encodeURIComponent(redirectTo)}` : route

  setCookie(event, 'oauth_popup', '1', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 5 * 60,
  })
  setCookie(event, 'oauth_redirect_to', redirectTo || '/', {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 5 * 60,
  })

  return success({ url })
})
