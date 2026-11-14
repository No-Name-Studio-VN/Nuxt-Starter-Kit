import { getClientSafeWebAuthnResponse } from '#layers/auth-passkeys/server/utils/webauthnResponse';
import { eq } from 'drizzle-orm';
import { apiError } from '#layers/server-core/server/utils/apiResponse';
import { useKV } from '#layers/server-core/server/utils/kv';
import userService from '#layers/auth/server/utils/database/user';

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
    const user = await userService.getByUsername(userName);
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
    await setUserSession(event, {
      user: {
        id: credential.user.id,
        name: credential.user.name,
        username: credential.user.username,
        isAdmin: credential.user.isAdmin,
      },
    });
  },
});

export default defineEventHandler(async (event) => {
  const response: unknown = await handler(event);
  return getClientSafeWebAuthnResponse(response);
});
