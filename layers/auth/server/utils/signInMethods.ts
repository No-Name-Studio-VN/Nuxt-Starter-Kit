import { and, eq, exists, gt, ne, sql } from 'drizzle-orm';
import { passwordIsSet } from '#layers/auth/server/utils/hasPassword';
import type { SignInMethodExclusion, SignInMethodSource } from '#layers/auth/types/signInMethods';
import { createOrderedRegistry } from '#layers/server-core/server/utils/orderedRegistry';

const signInMethodSources = createOrderedRegistry<SignInMethodSource>('Sign-in method source');

export function registerSignInMethodSource(source: SignInMethodSource): void {
  signInMethodSources.register(source);
}

function contributedSignInMethodCount(userId: number, exclusion?: SignInMethodExclusion) {
  const counts = signInMethodSources.list().map((source) => {
    const excludesCredential = exclusion && 'sourceId' in exclusion && exclusion.sourceId === source.id;
    return source.count(userId, excludesCredential ? exclusion.credentialId : undefined);
  });
  return sql<number>`(${sql.join([sql`0`, ...counts], sql` + `)})`;
}

export async function getContributedSignInMethodCount(userId: number): Promise<number> {
  if (!signInMethodSources.list().length) return 0;

  const result = await useDB()
    .select({ count: contributedSignInMethodCount(userId) })
    .from(tables.users)
    .where(eq(tables.users.id, userId))
    .get();
  return result?.count ?? 0;
}

/** Use in the DELETE predicate so concurrent removals cannot both rely on the same credential. */
export function hasOtherSignInMethod(userId: number, exclusion: SignInMethodExclusion) {
  const db = useDB();
  const { users, oauthAccounts } = tables;
  const password = db.select({ id: users.id }).from(users).where(and(
    eq(users.id, userId),
    passwordIsSet(users.password),
  ));
  const linkedAccount = db.select({ id: oauthAccounts.id }).from(oauthAccounts).where(and(
    eq(oauthAccounts.userId, userId),
    'provider' in exclusion ? ne(oauthAccounts.provider, exclusion.provider) : undefined,
  ));
  const contributed = gt(contributedSignInMethodCount(userId, exclusion), 0);

  return sql<boolean>`(${exists(password)} OR ${exists(linkedAccount)} OR ${contributed})`;
}
