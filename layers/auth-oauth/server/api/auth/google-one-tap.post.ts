import type { H3Event } from 'h3';
import type { OAuthProfile } from '#layers/auth-oauth/types/providers';
import type { GoogleOneTapPayload } from '#layers/auth-oauth/types/oauth';
import {
  apiError,
  success,
  zodErrorToFieldErrors,
} from '#layers/server-core/server/utils/apiResponse';
import { clearOAuthRequest, completeOAuthLogin } from '#layers/auth-oauth/server/utils/oauth';
import { verifyGoogleIdToken } from '#layers/auth-oauth/server/utils/googleIdentity';
import { OAUTH_EMAIL_IN_USE } from '#layers/auth-oauth/shared/constants/oauthMessages';
import { googleOneTapBodySchema } from '#layers/auth-oauth/shared/schemas/oauthSchema';

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

  const profile: OAuthProfile = {
    providerAccountId: googlePayload.subject,
    email: googlePayload.email,
    name: googlePayload.name,
    ...(googlePayload.picture === undefined ? {} : { avatarUrl: googlePayload.picture }),
  };

  const loginResult = await completeOAuthLogin(event, 'google', profile);
  if (loginResult.status === 'missing-user') {
    throw apiError({
      status: 401,
      statusText: 'Unauthorized',
      message: 'The linked Google account could not be found.',
      code: 'UNKNOWN_GOOGLE_ACCOUNT',
    });
  }

  if (loginResult.status === 'email-in-use') {
    throw apiError({
      status: 409,
      statusText: 'Conflict',
      message: OAUTH_EMAIL_IN_USE,
      code: 'OAUTH_EMAIL_IN_USE',
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
