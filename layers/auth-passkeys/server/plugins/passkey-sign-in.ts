import { and, count, eq, ne, sql } from 'drizzle-orm';
import { registerSignInMethod } from '#layers/auth/server/utils/signInMethods';

function countPasskeys(userId: number, excludeCredentialId?: string) {
  const { credentials } = tables;
  return useDB().select({ total: count() }).from(credentials).where(and(
    eq(credentials.userId, userId),
    excludeCredentialId === undefined ? undefined : ne(credentials.id, excludeCredentialId),
  ));
}

export default defineNitroPlugin(() => {
  registerSignInMethod({
    id: 'passkey',
    countCredentialsQuery: (userId, exclude) => sql<number>`${countPasskeys(userId, exclude)}`,
    async countCredentials(userId) {
      const row = await countPasskeys(userId).get();
      return row?.total ?? 0;
    },
  });
});
