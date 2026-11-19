import { eq } from 'drizzle-orm';

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
