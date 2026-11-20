import type { SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { OnboardingPendingInput } from '#layers/auth/types/onboarding';
import { and, eq, sql } from 'drizzle-orm';
import type { CreateUserInput, UserUpdateInput } from '#layers/auth/shared/schemas/userSchema';

/** The only reader and writer of password hashes. */
class UserPasswordService {
  private static instance: UserPasswordService;

  private get db() {
    return useDB();
  }

  public static getInstance(): UserPasswordService {
    if (!UserPasswordService.instance) {
      UserPasswordService.instance = new UserPasswordService();
    }
    return UserPasswordService.instance;
  }

  private credentialMatch(userId: number, excludeCredentialId?: string) {
    return excludeCredentialId === String(userId) ? sql`0` : eq(tables.userPasswords.userId, userId);
  }

  countCredentialsQuery(userId: number, excludeCredentialId?: string) {
    return sql<number>`${this.db.select({ count: sql<number>`count(*)` }).from(tables.userPasswords)
      .where(this.credentialMatch(userId, excludeCredentialId))}`;
  }

  async getCredentialUpdatedAt(userId: number): Promise<Date | null> {
    const row = await this.db.select({ updatedAt: tables.userPasswords.updatedAt })
      .from(tables.userPasswords).where(this.credentialMatch(userId)).get();
    return row?.updatedAt ?? null;
  }

  async hasPassword(userId: number): Promise<boolean> {
    const row = await this.db
      .select({ userId: tables.userPasswords.userId })
      .from(tables.userPasswords)
      .where(this.credentialMatch(userId))
      .get();

    return row !== undefined;
  }

  /** False when the password is wrong or the user has none. */
  async verify(userId: number, password: string): Promise<boolean> {
    const row = await this.db
      .select({ passwordHash: tables.userPasswords.passwordHash })
      .from(tables.userPasswords)
      .where(eq(tables.userPasswords.userId, userId))
      .get();
    if (!row) return false;

    return verifyPassword(row.passwordHash, password);
  }

  async createUser(data: CreateUserInput & OnboardingPendingInput, password: string) {
    const passwordHash = await hashPassword(password);
    const db = this.db;
    const [[user]] = await db.batch([
      db.insert(tables.users).values(data).returning(),
      // The preceding insert must succeed, so the unique username identifies the row in this batch.
      db
        .insert(tables.userPasswords)
        .select(
          this.selectCredential(passwordHash).where(eq(tables.users.username, data.username)),
        ),
    ]);
    if (!user) throw new Error('Creating a password user returned no user.');
    return user;
  }

  async updateUser(data: UserUpdateInput, password: string, cleanup?: BatchItem<'sqlite'>) {
    const passwordHash = await hashPassword(password);
    const db = this.db;
    const matchUser = eq(tables.users.id, data.id);
    const [[user]] = await db.batch([
      db.update(tables.users).set(data).where(matchUser).returning(),
      db
        .insert(tables.userPasswords)
        .select(this.selectCredential(passwordHash).where(matchUser))
        .onConflictDoUpdate({
          target: tables.userPasswords.userId,
          set: { passwordHash, updatedAt: new Date() },
        }),
      ...(cleanup ? [cleanup] : []),
    ]);
    return user;
  }

  buildResetPasswordQuery(passwordHash: string, now: Date, userId: number, redeemable: SQL) {
    const { users, userPasswords } = tables;
    return this.db.insert(userPasswords)
      .select(this.selectCredential(passwordHash, now).where(and(eq(users.id, userId), redeemable)))
      .onConflictDoUpdate({ target: userPasswords.userId, set: { passwordHash, updatedAt: now } });
  }

  async setInitial(userId: number, password: string): Promise<boolean> {
    const passwordHash = await hashPassword(password);
    const row = await this.db.insert(tables.userPasswords)
      .values({ userId, passwordHash, updatedAt: new Date() })
      .onConflictDoNothing({ target: tables.userPasswords.userId })
      .returning({ userId: tables.userPasswords.userId }).get();
    return row !== undefined;
  }

  private selectCredential(passwordHash: string, now = new Date()) {
    return this.db
      .select({
        userId: tables.users.id,
        passwordHash: sql`${passwordHash}`.as('password_hash'),
        updatedAt: sql`${sql.param(now, tables.userPasswords.updatedAt)}`.as('updated_at'),
      })
      .from(tables.users);
  }

  /** Hashes `password` and sets it as the user's password, adding one if they had none. */
  async set(userId: number, password: string): Promise<void> {
    const passwordHash = await hashPassword(password);
    const updatedAt = new Date();

    await this.db
      .insert(tables.userPasswords)
      .values({ userId, passwordHash, updatedAt })
      .onConflictDoUpdate({
        target: tables.userPasswords.userId,
        set: { passwordHash, updatedAt },
      });
  }
}

export default UserPasswordService.getInstance();
