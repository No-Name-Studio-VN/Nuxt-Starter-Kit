import type { GoogleOneTapPayload } from '#layers/auth/types/auth';
import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import { completeOAuthLogin } from '#layers/auth/server/utils/oauth';
import { verifyGoogleIdToken } from '#layers/auth/server/utils/googleIdentity';
import { googleProfile } from '#layers/auth/server/utils/oauthProviders';
import { googleOneTapBodySchema } from '#layers/auth/shared/schemas/userSchema';

export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (session?.user?.id) {
    return success<GoogleOneTapPayload>({ authenticated: true, status: 'signed-in' });
  }

  const bodyResult = googleOneTapBodySchema.safeParse(await readBody(event));
  if (!bodyResult.success) {
    throw apiError({
      status: 400,
      statusText: 'Bad Request',
      message: 'Invalid request body.',
      code: 'VALIDATION_ERROR',
      fieldErrors: zodErrorToFieldErrors(bodyResult.error),
    });
  }

  const runtimeConfig = useRuntimeConfig(event);
  const googleOneTapClientId = runtimeConfig.public.googleOneTapClientId;
  const clientId = typeof googleOneTapClientId === 'string' ? googleOneTapClientId.trim() : '';
  if (clientId.length === 0) {
    throw apiError({
      status: 500,
      statusText: 'Internal Server Error',
      message: 'Google One Tap is not configured.',
      code: 'GOOGLE_ONE_TAP_NOT_CONFIGURED',
    });
  }

  let googlePayload: Awaited<ReturnType<typeof verifyGoogleIdToken>>;
  try {
    googlePayload = await verifyGoogleIdToken({
      token: bodyResult.data.credential,
      audience: clientId,
    });
  } catch {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Google One Tap credential is invalid.',
      code: 'INVALID_GOOGLE_ONE_TAP_CREDENTIAL',
    });
  }

  const profile = googleProfile({
    sub: googlePayload.subject,
    email: googlePayload.email,
    email_verified: googlePayload.emailVerified,
    name: googlePayload.name,
    picture: googlePayload.picture,
    hd: googlePayload.hd,
  });

  const loginResult = await completeOAuthLogin(event, 'google', profile);
  if (loginResult.status === 'missing-user') {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'The linked Google account could not be found.',
      code: 'UNKNOWN_GOOGLE_ACCOUNT',
    });
  }

  if (loginResult.status === 'refused') {
    const missingEmail = loginResult.code === 'oauth-email-missing';
    throw apiError({
      status: missingEmail ? 400 : 409,
      statusText: missingEmail ? 'Bad Request' : 'Conflict',
      message: missingEmail
        ? 'The provider did not share an email address.'
        : 'Sign in with your existing method and connect the provider from Settings → Security.',
      code: loginResult.code,
    });
  }

  return success<GoogleOneTapPayload>({ authenticated: true, status: loginResult.status });
});
