import { and, eq, exists, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import type { User } from '#layers/auth/types/auth';
import { getSignInMethod } from '#layers/auth/server/utils/signInMethods';
import userPasswordService from '#layers/auth-password/server/utils/database/userPassword';
import type { AuthTokenKind, DBAuthToken, PasswordResetData } from '#layers/auth-password/types/authTokens';
import { AuthTokenType, RESEND_COOLDOWN_MS } from '#layers/auth-password/shared/constants/authTokens';
import { getAuthTokenLifetime } from '#layers/auth-password/server/utils/authTokenKinds';
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

  async createEmailBoundToken(user: Pick<User, 'id' | 'email'>, type: AuthTokenKind): Promise<string | undefined> {
    const token = generateToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + getAuthTokenLifetime(type));
    const { authTokens, users } = tables;
    const email = normalizeEmail(user.email);
    // Do not issue or deliver a token for a profile snapshot that was superseded.
    const [issued] = await this.db.all<{ token: string }>(sql`
      insert into ${authTokens} (user_id, token, type, email, expires_at, created_at, updated_at)
      select ${users.id}, ${token}, ${type}, ${email}, ${sql.param(expiresAt, authTokens.expiresAt)},
        ${sql.param(now, authTokens.createdAt)}, ${sql.param(now, authTokens.updatedAt)}
      from ${users}
      where ${users.id} = ${user.id} and lower(trim(${users.email})) = ${email}
      returning token
    `);
    return issued?.token;
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
    invalidateAll: boolean,
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
      .set({ emailVerified: true })
      .where(and(eq(users.id, token.userId), tokenExists))
      .returning({ id: users.id });
    const invalidateOtherTokens = this.db.update(authTokens)
      .set({ usedAt: now })
      .where(and(
        eq(authTokens.userId, token.userId),
        invalidateAll ? undefined : eq(authTokens.type, type),
        isNull(authTokens.usedAt),
        ne(authTokens.id, token.id),
        tokenExists,
      ));
    const consumeToken = this.db.update(authTokens).set({ usedAt: now }).where(redeemable)
      .returning({ id: authTokens.id });

    // Keep the redeemed token unused until the last statement, so earlier writes can use it as a guard.
    return { now, tokenExists, updateUser, invalidateOtherTokens, consumeToken };
  }

  async redeemEmailVerification(token: DBAuthToken, type: AuthTokenKind): Promise<boolean> {
    const { updateUser, invalidateOtherTokens, consumeToken } = this.emailBoundRedemptionQueries(token, type, false);
    const [, , [consumed]] = await this.db.batch([updateUser, invalidateOtherTokens, consumeToken]);
    return Boolean(consumed);
  }

  async redeemPasswordReset(token: DBAuthToken, passwordHash: string): Promise<PasswordResetData | undefined> {
    const { now, tokenExists, updateUser, invalidateOtherTokens, consumeToken } =
      this.emailBoundRedemptionQueries(token, AuthTokenType.PasswordReset, true);
    const setPassword = userPasswordService.buildResetPasswordQuery(passwordHash, now, token.userId, tokenExists);
    const cleanup = getSignInMethod('oauth')?.buildUnverifiedEmailResetCleanup?.(token.userId, tokenExists);

    if (cleanup) {
      const [disconnected, , , , [consumed]] = await this.db.batch([
        cleanup, setPassword, updateUser, invalidateOtherTokens, consumeToken,
      ]);
      return consumed ? { oauthAccountsDisconnected: disconnected.length > 0 } : undefined;
    }

    const [, , , [consumed]] = await this.db.batch([setPassword, updateUser, invalidateOtherTokens, consumeToken]);
    return consumed ? { oauthAccountsDisconnected: false } : undefined;
  }

  async markUsed(tokenId: number): Promise<void> {
    await this.db.update(tables.authTokens).set({ usedAt: new Date() }).where(eq(tables.authTokens.id, tokenId));
  }

  async invalidateEmailBoundTokens(user: Pick<User, 'id' | 'email'>, type: AuthTokenKind): Promise<void> {
    const { authTokens, users } = tables;
    const email = normalizeEmail(user.email);
    const addressStillCurrent = exists(this.db.select({ id: users.id }).from(users).where(and(
      eq(users.id, user.id), sql`lower(trim(${users.email})) = ${email}`,
    )));
    await this.db.update(authTokens).set({ usedAt: new Date() }).where(and(
      eq(authTokens.userId, user.id), eq(authTokens.type, type), isNull(authTokens.usedAt), addressStillCurrent,
    ));
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

  async hasRecentToken(userId: number, type: AuthTokenKind, email?: string): Promise<boolean> {
    const cutoff = new Date(Date.now() - RESEND_COOLDOWN_MS);
    const recent = await this.db
      .select()
      .from(tables.authTokens)
      .where(
        and(
          eq(tables.authTokens.userId, userId),
          eq(tables.authTokens.type, type),
          gt(tables.authTokens.createdAt, cutoff),
          email === undefined ? undefined : eq(tables.authTokens.email, normalizeEmail(email)),
          isNull(tables.authTokens.usedAt),
        ),
      )
      .get();

    return Boolean(recent);
  }

  async cleanupExpired(): Promise<void> {
    await this.db.delete(tables.authTokens).where(lt(tables.authTokens.expiresAt, new Date()));
  }
}

export default AuthTokenService.getInstance();
