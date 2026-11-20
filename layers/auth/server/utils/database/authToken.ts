import { and, eq, exists, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import type { DBAuthToken, User } from '#layers/auth/types/auth';
import type { AuthTokenKind, PasswordResetData } from '#layers/auth/types/authTokens';
import { AuthTokenType, RESEND_COOLDOWN_MS } from '#layers/auth/shared/constants/authTokens';
import { getAuthTokenLifetime } from '#layers/auth/server/utils/authTokenKinds';
import { normalizeEmail } from '#shared/utils/normalizeEmail';

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

class AuthTokenService {
  private static instance: AuthTokenService;

  private get db() {
    return useDB();
  }

  public static getInstance(): AuthTokenService {
    if (!AuthTokenService.instance) {
      AuthTokenService.instance = new AuthTokenService();
    }
    return AuthTokenService.instance;
  }

  async createToken(userId: number, type: AuthTokenKind): Promise<string> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + getAuthTokenLifetime(type));

    await this.db.insert(tables.authTokens).values({ userId, token, type, expiresAt });

    return token;
  }

  async createEmailBoundToken(user: Pick<User, 'id' | 'email'>, type: AuthTokenKind): Promise<string> {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + getAuthTokenLifetime(type));

    await this.db.insert(tables.authTokens).values({
      userId: user.id,
      email: normalizeEmail(user.email),
      token,
      type,
      expiresAt,
    });

    return token;
  }

  async verifyToken(token: string, type: AuthTokenKind): Promise<DBAuthToken | null> {
    const record = await this.db
      .select()
      .from(tables.authTokens)
      .where(
        and(
          eq(tables.authTokens.token, token),
          eq(tables.authTokens.type, type),
          isNull(tables.authTokens.usedAt),
        ),
      )
      .get();

    if (!record) return null;
    if (record.expiresAt < new Date()) return null;

    return record;
  }

  private emailBoundRedemptionQueries(
    token: DBAuthToken,
    type: AuthTokenKind,
    password?: string,
  ) {
    const { authTokens, users } = tables;
    const now = new Date();
    // Existing addresses may not yet be normalized. NULL bindings never match.
    const currentAddress = exists(this.db.select({ id: users.id }).from(users).where(and(
      eq(users.id, authTokens.userId),
      sql`lower(trim(${users.email})) = ${authTokens.email}`,
    )));
    const redeemable = and(
      eq(authTokens.id, token.id),
      currentAddress,
      eq(authTokens.token, token.token),
      eq(authTokens.userId, token.userId),
      eq(authTokens.type, type),
      isNull(authTokens.usedAt),
      gt(authTokens.expiresAt, now),
    );
    const tokenExists = exists(this.db.select({ id: authTokens.id }).from(authTokens).where(redeemable));

    const updateUser = this.db.update(users)
      .set({ emailVerified: true, password, passwordChangedAt: password === undefined ? undefined : now })
      .where(and(eq(users.id, token.userId), tokenExists))
      .returning({ id: users.id });
    const invalidateOtherTokens = this.db.update(authTokens)
      .set({ usedAt: now })
      .where(and(
        eq(authTokens.userId, token.userId),
        password === undefined ? eq(authTokens.type, type) : undefined,
        isNull(authTokens.usedAt),
        ne(authTokens.id, token.id),
        tokenExists,
      ));
    const consumeToken = this.db.update(authTokens).set({ usedAt: now }).where(redeemable);

    // Keep the redeemed token unused until the last statement, so earlier writes can use it as a guard.
    return { tokenExists, updateUser, invalidateOtherTokens, consumeToken };
  }

  async redeemEmailVerification(token: DBAuthToken): Promise<boolean> {
    const { updateUser, invalidateOtherTokens, consumeToken } = this.emailBoundRedemptionQueries(
      token,
      AuthTokenType.EmailVerification,
    );
    const [[updatedUser]] = await this.db.batch([updateUser, invalidateOtherTokens, consumeToken]);
    return Boolean(updatedUser);
  }

  async redeemPasswordReset(token: DBAuthToken, password: string): Promise<PasswordResetData | undefined> {
    const { oauthAccounts, users } = tables;
    const { tokenExists, updateUser, invalidateOtherTokens, consumeToken } =
      this.emailBoundRedemptionQueries(token, AuthTokenType.PasswordReset, password);
    const unverifiedUser = this.db.select({ id: users.id }).from(users)
      .where(and(eq(users.id, token.userId), eq(users.emailVerified, false)));
    const disconnectAccounts = this.db.delete(oauthAccounts)
      .where(and(eq(oauthAccounts.userId, token.userId), exists(unverifiedUser), tokenExists))
      .returning({ id: oauthAccounts.id });

    const [disconnected, [updatedUser]] = await this.db.batch([
      disconnectAccounts,
      updateUser,
      invalidateOtherTokens,
      consumeToken,
    ]);
    if (!updatedUser) return undefined;
    return { oauthAccountsDisconnected: disconnected.length > 0 };
  }

  async invalidateUserTokens(userId: number, type?: AuthTokenKind): Promise<void> {
    await this.db
      .update(tables.authTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(tables.authTokens.userId, userId),
          type === undefined ? undefined : eq(tables.authTokens.type, type),
          isNull(tables.authTokens.usedAt),
        ),
      );
  }

  deleteEmailBoundTokensQuery(userId: number) {
    return this.db.delete(tables.authTokens).where(
      and(
        eq(tables.authTokens.userId, userId),
        inArray(tables.authTokens.type, [AuthTokenType.PasswordReset, AuthTokenType.EmailVerification]),
        isNull(tables.authTokens.usedAt),
      ),
    );
  }

  async hasRecentToken(userId: number, type: AuthTokenKind): Promise<boolean> {
    const cutoff = new Date(Date.now() - RESEND_COOLDOWN_MS);
    const recent = await this.db
      .select()
      .from(tables.authTokens)
      .where(
        and(
          eq(tables.authTokens.userId, userId),
          eq(tables.authTokens.type, type),
          isNull(tables.authTokens.usedAt),
        ),
      )
      .get();

    return !!recent && !!recent.createdAt && recent.createdAt > cutoff;
  }

  async cleanupExpired(): Promise<void> {
    await this.db.delete(tables.authTokens).where(lt(tables.authTokens.expiresAt, new Date()));
  }
}

export default AuthTokenService.getInstance();
