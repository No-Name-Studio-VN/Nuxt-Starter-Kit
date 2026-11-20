import type { H3Event } from 'h3';
import { googleProfile } from '#layers/auth-oauth/server/oauth/providers/google';
import type { GoogleOneTapPayload } from '#layers/auth-oauth/types/oauth';
import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import { clearOAuthRequest, completeOAuthLogin } from '#layers/auth-oauth/server/utils/oauth';
import { verifyGoogleIdToken } from '#layers/auth-oauth/server/utils/googleIdentity';
import { OAUTH_ERROR_MESSAGES } from '#layers/auth-oauth/shared/constants/oauthMessages';
import { googleOneTapBodySchema, oauthProfileSchema } from '#layers/auth-oauth/shared/schemas/oauthSchema';

async function signInWithGoogleOneTap(event: H3Event) {
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

  const profile = oauthProfileSchema.safeParse(googleProfile({
    sub: googlePayload.subject,
    email: googlePayload.email,
    email_verified: googlePayload.emailVerified,
    name: googlePayload.name,
    picture: googlePayload.picture,
    hd: googlePayload.hd,
  }));
  if (!profile.success) {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'Google One Tap credential is invalid.',
      code: 'INVALID_GOOGLE_ONE_TAP_CREDENTIAL',
    });
  }

  const loginResult = await completeOAuthLogin(event, 'google', profile.data);
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
      message: OAUTH_ERROR_MESSAGES[loginResult.code].fallback,
      code: loginResult.code === 'oauth-email-in-use' ? 'OAUTH_EMAIL_IN_USE' : loginResult.code,
    });
  }

  const { outcome } = loginResult;
  if (outcome.kind === 'respond') {
    throw apiError({
      status: 403,
      statusText: 'Forbidden',
      message: 'This account needs another step to sign in. Try a different sign-in method.',
      code: 'SIGN_IN_STEP_REQUIRED',
    });
  }
  if (outcome.kind === 'deny') {
    throw apiError(outcome.error);
  }

  return success<GoogleOneTapPayload>({ authenticated: true, status: loginResult.status });
}

export default defineEventHandler(async (event) => {
  try {
    return await signInWithGoogleOneTap(event);
  } catch (error) {
    clearOAuthRequest(event);
    throw error;
  }
});
