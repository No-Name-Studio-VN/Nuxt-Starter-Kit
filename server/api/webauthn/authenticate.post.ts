import { eq } from 'drizzle-orm';
import { apiError } from '~~/server/utils/apiResponse';
import subscriptionService from '~~/server/utils/database/userSubscription';
import { useKV } from '~~/server/utils/kv';

export default defineWebAuthnAuthenticateEventHandler({
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
    const db = useDB();

    const user = await db.query.users.findFirst({
      where: eq(tables.users.username, userName),
      with: {
        credentials: true,
      },
    });

    return user?.credentials || [];
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
    const subscription = await subscriptionService.getActiveByUserId(credential.user.id);

    await setUserSession(event, {
      user: {
        id: credential.user.id,
        name: credential.user.name,
        username: credential.user.username,
        isAdmin: credential.user.isAdmin,
        subscription,
      },
    });
  },
});
