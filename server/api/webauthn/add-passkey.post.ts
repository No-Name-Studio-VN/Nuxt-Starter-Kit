import { eq } from 'drizzle-orm';
import { apiError, zodErrorToFieldErrors } from '~~/server/utils/apiResponse';
import { useKV } from '~~/server/utils/kv';
import { webauthnAddPasskeyUserSchema } from '#shared/schemas/userSecuritySchema';

export default defineWebAuthnRegisterEventHandler({
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
  async validateUser(user) {
    const result = webauthnAddPasskeyUserSchema.safeParse(user);
    if (!result.success) {
      throw apiError({
        status: 400,
        statusText: 'Bad Request',
        message: 'Please fix the highlighted fields.',
        code: 'VALIDATION_ERROR',
        fieldErrors: zodErrorToFieldErrors(result.error),
      });
    }

    return result.data;
  },
  async onSuccess(event, { user, credential }) {
    const db = useDB();
    const session = await getUserSession(event);

    if (!session?.user) {
      throw apiError({
        status: 401,
        statusText: 'Unauthorized',
        message: 'Unauthorized. You must be signed in to add a passkey.',
        code: 'SESSION_REQUIRED',
      });
    }

    // Verify the username matches the logged-in user
    const sessionUser = session.user;
    if (sessionUser.username !== user.userName) {
      throw apiError({
        status: 403,
        statusText: 'Forbidden',
        message: 'Forbidden. The username does not match the currently authenticated user.',
        code: 'USERNAME_MISMATCH',
      });
    }

    // Check if user already has a credential with this ID
    const existingCredential = await db
      .select()
      .from(tables.credentials)
      .where(eq(tables.credentials.id, credential.id))
      .get();

    if (existingCredential) {
      throw apiError({
        status: 400,
        statusText: 'Bad Request',
        message: 'Bad Request. A passkey with this credential already exists on this account.',
        code: 'PASSKEY_ALREADY_EXISTS',
      });
    }

    await db.insert(tables.credentials).values({
      userId: sessionUser.id,
      id: credential.id,
      publicKey: credential.publicKey,
      counter: credential.counter,
      backedUp: credential.backedUp,
      transports: credential.transports,
    });
  },
  async excludeCredentials(event, _userName) {
    const session = await getUserSession(event);
    if (!session?.user) {
      return [];
    }

    const sessionUser = session.user;
    return useDB()
      .select({
        id: tables.credentials.id,
        transports: tables.credentials.transports,
      })
      .from(tables.credentials)
      .where(eq(tables.credentials.userId, sessionUser.id));
  },
});
