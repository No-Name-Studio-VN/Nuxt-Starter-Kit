import { and, count, eq, exists, inArray, ne, notExists, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { CreateUserInput } from '#layers/auth/shared/schemas/userSchema';
import type { OnboardingPendingInput } from '#layers/auth/types/onboarding';
import type { User } from '#layers/auth/types/auth';
import type { LinkedAccount, OAuthLinkInput } from '#layers/auth-oauth/types/oauth';
import { alias } from 'drizzle-orm/sqlite-core';
import { oauthLinkPolicyWritePredicate } from '#layers/auth/server/utils/oauthLinkPolicies';
import { hasOtherSignInMethod } from '#layers/auth/server/utils/signInMethods';

class OAuthAccountService {
  private static instance: OAuthAccountService;

  private get db() {
    return useDB();
  }

  public static getInstance(): OAuthAccountService {
    if (!OAuthAccountService.instance) {
      OAuthAccountService.instance = new OAuthAccountService();
    }
    return OAuthAccountService.instance;
  }

  /**
   * Find a linked account by provider + provider account ID
   */
  async getByProviderAccount(provider: string, providerAccountId: string) {
    return this.db
      .select()
      .from(tables.oauthAccounts)
      .where(
        and(
          eq(tables.oauthAccounts.provider, provider),
          eq(tables.oauthAccounts.providerAccountId, providerAccountId),
        ),
      )
      .get();
  }

  /**
   * Get all linked OAuth accounts for a user
   */
  async getByUserId(userId: number): Promise<LinkedAccount[]> {
    const { oauthAccounts } = tables;
    return this.db
      .select({
        provider: oauthAccounts.provider,
        email: oauthAccounts.email,
        name: oauthAccounts.name,
        avatarUrl: oauthAccounts.avatarUrl,
        linkedAt: oauthAccounts.createdAt,
      })
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, userId))
      .orderBy(oauthAccounts.createdAt, oauthAccounts.id)
      .all();
  }

  /**
   * Check if a user already has a specific provider linked
   */
  async getByUserAndProvider(userId: number, provider: string) {
    return this.db
      .select()
      .from(tables.oauthAccounts)
      .where(
        and(eq(tables.oauthAccounts.userId, userId), eq(tables.oauthAccounts.provider, provider)),
      )
      .get();
  }

  private linkQuery(data: Omit<OAuthLinkInput, 'userId'>, userId: number | SQL) {
    return this.db.insert(tables.oauthAccounts).values({
      userId,
      provider: data.provider,
      providerAccountId: data.providerAccountId,
      email: data.email ?? null,
      name: data.name ?? null,
      avatarUrl: data.avatarUrl ?? null,
    });
  }

  async link(data: OAuthLinkInput) {
    return this.linkQuery(data, data.userId).returning().get();
  }

  async linkVerifiedEmail(user: User, data: Omit<OAuthLinkInput, 'userId'>) {
    // Recheck verification and admin status at write time in case either changed during policy checks.
    const duplicate = alias(tables.users, 'duplicate_mailbox');
    const ambiguous = this.db.select({ id: duplicate.id }).from(duplicate).where(and(
      ne(duplicate.id, user.id),
      sql`lower(${duplicate.email}) = lower(${user.email})`,
    ));
    const matchedUserId = this.db.select({ id: tables.users.id }).from(tables.users)
      .where(and(
        eq(tables.users.id, user.id),
        eq(tables.users.email, user.email),
        eq(tables.users.emailVerified, true),
        eq(tables.users.isAdmin, false),
        notExists(ambiguous),
        oauthLinkPolicyWritePredicate(user.id),
      ));
    return this.linkQuery(data, sql`(${matchedUserId})`).returning().get();
  }

  async createUserWithLink(
    user: CreateUserInput & OnboardingPendingInput,
    data: Omit<OAuthLinkInput, 'userId'>,
  ) {
    const db = this.db;
    const insertUser = db.insert(tables.users).values(user).returning();
    // The username can only resolve to the user inserted by the first statement of this batch.
    const insertedUserId = db.select({ id: tables.users.id }).from(tables.users)
      .where(eq(tables.users.username, user.username));
    const [[createdUser]] = await db.batch([
      insertUser,
      this.linkQuery(data, sql`(${insertedUserId})`),
    ]);
    return createdUser;
  }

  async updateDisplay(id: number, data: Pick<OAuthLinkInput, 'email' | 'name' | 'avatarUrl'>) {
    await this.db.update(tables.oauthAccounts).set({
      email: data.email ?? null,
      name: data.name ?? null,
      avatarUrl: data.avatarUrl ?? null,
      updatedAt: new Date(),
    }).where(eq(tables.oauthAccounts.id, id));
  }

  async unlink(userId: number, provider: string, requireOtherMethod = true) {
    const { oauthAccounts } = tables;
    return this.db.delete(oauthAccounts).where(and(
      eq(oauthAccounts.userId, userId),
      eq(oauthAccounts.provider, provider),
      requireOtherMethod ? hasOtherSignInMethod(userId, { methodId: 'oauth', credentialId: provider }) : undefined,
    )).returning({ id: oauthAccounts.id }).get();
  }
  private countQuery(userId: number, readyProviders: string[], excludeProvider?: string) {
    const { oauthAccounts } = tables;
    return this.db.select({ count: count() }).from(oauthAccounts).where(and(
      eq(oauthAccounts.userId, userId),
      inArray(oauthAccounts.provider, readyProviders),
      excludeProvider === undefined ? undefined : ne(oauthAccounts.provider, excludeProvider),
    ));
  }

  countCredentialsQuery(userId: number, readyProviders: string[], excludeProvider?: string) {
    return readyProviders.length ? sql<number>`${this.countQuery(userId, readyProviders, excludeProvider)}` : sql<number>`0`;
  }

  async countByUserId(userId: number, readyProviders: string[]): Promise<number> {
    if (!readyProviders.length) return 0;
    return (await this.countQuery(userId, readyProviders).get())?.count ?? 0;
  }

  buildUnverifiedEmailResetCleanup(userId: number, redeemable: SQL) {
    const { oauthAccounts, users } = tables;
    const unverifiedUser = this.db.select({ id: users.id }).from(users)
      .where(and(eq(users.id, userId), eq(users.emailVerified, false)));
    return this.db.delete(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, userId), exists(unverifiedUser), redeemable))
      .returning({ id: oauthAccounts.id });
  }
}

export default OAuthAccountService.getInstance();
