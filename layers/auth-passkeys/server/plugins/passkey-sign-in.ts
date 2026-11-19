import { count, eq } from 'drizzle-orm';
import { registerSignInMethod } from '#layers/auth/server/utils/signInMethods';

export default defineNitroPlugin(() => {
  registerSignInMethod({
    id: 'passkey',
    async countCredentials(userId) {
      const row = await useDB()
        .select({ total: count() })
        .from(tables.credentials)
        .where(eq(tables.credentials.userId, userId))
        .get();
      return row?.total ?? 0;
    },
  });
});
