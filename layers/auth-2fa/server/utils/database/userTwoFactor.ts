import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DBTwoFactor } from '#layers/auth-2fa/types/twoFactor';
import { IDatabaseService } from '#layers/database/types/db/database-service';
import type {
  UserTwoFactorCreateInput,
  UserTwoFactorUpdateInput,
} from '#layers/auth-2fa/shared/schemas/twoFactorSchema';

class UserTwoFactorService extends IDatabaseService<DBTwoFactor> {
  private static instance: UserTwoFactorService;

  private get db() {
    return useDB();
  }

  public static getInstance(): UserTwoFactorService {
    if (!UserTwoFactorService.instance) {
      UserTwoFactorService.instance = new UserTwoFactorService();
    }
    return UserTwoFactorService.instance;
  }

  /**
   * Get a user's 2FA settings by userId
   */
  async getById(userId: number): Promise<DBTwoFactor | undefined> {
    return this.db
      .select()
      .from(tables.userTwoFactor)
      .where(eq(tables.userTwoFactor.userId, userId))
      .get();
  }

  /**
   * Get every user's 2FA settings
   */
  async getList(): Promise<DBTwoFactor[]> {
    return this.db.select().from(tables.userTwoFactor).all();
  }

  /**
   * Create a user's 2FA settings
   */
  async create(data: UserTwoFactorCreateInput) {
    return this.db.insert(tables.userTwoFactor).values(data).returning().get();
  }

  /**
   * Update a user's 2FA settings
   */
  async update(data: UserTwoFactorUpdateInput) {
    return this.db
      .update(tables.userTwoFactor)
      .set(data)
      .where(eq(tables.userTwoFactor.userId, data.userId))
      .returning()
      .get();
  }

  /**
   * Consume against the current database row, not a previously read snapshot.
   * One conditional write prevents concurrent login/unlock requests from reusing
   * a code or restoring a different code consumed by another request.
   */
  async consumeBackupCode(userId: number, code: string): Promise<boolean> {
    const result = await this.db
      .update(tables.userTwoFactor)
      .set({
        backupCodes: sql`(
          SELECT json_group_array(value)
          FROM json_each(${tables.userTwoFactor.backupCodes})
          WHERE value != ${code}
        )`,
      })
      .where(
        and(
          eq(tables.userTwoFactor.userId, userId),
          eq(tables.userTwoFactor.enabled, true),
          sql`EXISTS (
          SELECT 1 FROM json_each(${tables.userTwoFactor.backupCodes})
          WHERE value = ${code}
        )`,
        ),
      )
      .returning({ userId: tables.userTwoFactor.userId })
      .get();
    return result !== undefined;
  }

  /**
   * Delete a user's 2FA settings
   */
  async delete(userId: number): Promise<void> {
    await this.db.delete(tables.userTwoFactor).where(eq(tables.userTwoFactor.userId, userId));
  }

  /**
   * Delete the 2FA settings of several users
   */
  async bulkDelete(userIds: number[]): Promise<void> {
    if (userIds.length === 0) return;

    await this.db.delete(tables.userTwoFactor).where(inArray(tables.userTwoFactor.userId, userIds));
  }
}

export default UserTwoFactorService.getInstance();
