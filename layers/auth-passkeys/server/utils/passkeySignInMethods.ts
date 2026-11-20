import { and, count, eq, ne, sql } from 'drizzle-orm';
import type { SignInMethodSource } from '#layers/auth/types/signInMethods';

export const passkeySignInMethodSource: SignInMethodSource = {
  id: 'passkeys',
  order: 100,
  count(userId, excludeId) {
    const { credentials } = tables;
    const query = useDB().select({ count: count() }).from(credentials).where(and(
      eq(credentials.userId, userId),
      excludeId === undefined ? undefined : ne(credentials.id, excludeId),
    ));
    return sql<number>`(${query})`;
  },
};
