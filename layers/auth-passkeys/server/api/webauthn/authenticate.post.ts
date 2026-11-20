import { defineEventHandler } from 'nuxt/server';
import { signInUsernameSchema } from '#layers/auth/shared/schemas/userSchema';
import { getClientSafeWebAuthnResponse } from '#layers/auth-passkeys/server/utils/webauthnResponse';
import { eq } from 'drizzle-orm';
import { apiError } from '#layers/server-core/server/utils/apiResponse';
import { useKV } from '#layers/server-core/server/utils/kv';
import userService from '#layers/auth/server/utils/database/user';
import { completeSignIn } from '#layers/auth/server/utils/completeSignIn';

const handler = defineWebAuthnAuthenticateEventHandler({
  async storeChallenge(event, challenge, attemptId) {
    await useKV().set(`auth:challenge:${attemptId}`, challenge, { ttl: 60 });
  },
  async getChallenge(event, attemptId) {
    const challenge = await useKV().get<string>(`auth:challenge:${attemptId}`);
    if (!challenge) {
      throw apiError({
        status: 400,
        statusText: 'Bad Request',
        message:
          'Bad Request. The authentication challenge has expired or was not found. Please try again.',
        code: 'AUTH_CHALLENGE_EXPIRED',
      });
    }
    await useKV().del(`auth:challenge:${attemptId}`);
    return challenge;
  },
  async allowCredentials(event, userName) {
    const result = signInUsernameSchema.safeParse(userName);
    if (!result.success) return [];

    const user = await userService.getByUsername(result.data) ??
      (userName === result.data ? undefined : await userService.getByUsername(userName));
    if (!user) {
      return [];
    }

    return useDB()
      .select({
        id: tables.credentials.id,
        transports: tables.credentials.transports,
      })
      .from(tables.credentials)
      .where(eq(tables.credentials.userId, user.id));
  },
  async getCredential(event, credentialID) {
    const credential = await useDB().query.credentials.findFirst({
      where: eq(tables.credentials.id, credentialID),
      with: {
        user: true,
      },
    });

    if (!credential) {
      throw apiError({
        status: 404,
        statusText: 'Not Found',
        message: 'Not Found. The specified passkey credential was not found.',
        code: 'PASSKEY_NOT_FOUND',
      });
    }

    return credential;
  },
  async onSuccess(event, { credential }) {
    const outcome = await completeSignIn(event, credential.user, {
      method: 'passkey',
      redirectTo: '/',
    });
    if (outcome.kind === 'deny') {
      throw apiError(outcome.error);
    }
    // The ceremony answers with its own JSON, so a policy that wants to answer
    // the request itself cannot be shown here; the sign-in stops instead.
    if (outcome.kind === 'respond') {
      throw apiError({
        status: 403,
        statusText: 'Forbidden',
        message: 'Forbidden. This account needs another step to sign in. Please use your password.',
        code: 'SIGN_IN_STEP_REQUIRED',
      });
    }

    await useDB().update(tables.credentials).set({ lastUsedAt: new Date() })
      .where(eq(tables.credentials.id, credential.id));
  },
});

export default defineEventHandler(async (event) => {
  const response: unknown = await handler(event);
  return getClientSafeWebAuthnResponse(response);
});
