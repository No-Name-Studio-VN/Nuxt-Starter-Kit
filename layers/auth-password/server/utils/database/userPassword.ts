import { eq, sql } from 'drizzle-orm';
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

  async hasPassword(userId: number): Promise<boolean> {
    const row = await this.db
      .select({ userId: tables.userPasswords.userId })
      .from(tables.userPasswords)
      .where(eq(tables.userPasswords.userId, userId))
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

  async createUser(data: CreateUserInput, password: string) {
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

  async updateUser(data: UserUpdateInput, password: string) {
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
    ]);
    return user;
  }

  private selectCredential(passwordHash: string) {
    return this.db
      .select({
        userId: tables.users.id,
        passwordHash: sql`${passwordHash}`.as('password_hash'),
        updatedAt: sql`${sql.param(new Date(), tables.userPasswords.updatedAt)}`.as('updated_at'),
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
