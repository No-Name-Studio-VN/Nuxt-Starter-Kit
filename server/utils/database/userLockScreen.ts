import { eq, inArray } from 'drizzle-orm';
import type { DBLockScreen } from '#shared/db';
import { IDatabaseService } from '~~/types/db/database-service';
import type { UserLockScreenCreateInput, UserLockScreenUpdateInput } from '#shared/schemas';

class UserLockScreenService extends IDatabaseService<DBLockScreen> {
  private static instance: UserLockScreenService;

  private get db() {
    return useDB();
  }

  public static getInstance(): UserLockScreenService {
    if (!UserLockScreenService.instance) {
      UserLockScreenService.instance = new UserLockScreenService();
    }
    return UserLockScreenService.instance;
  }

  /**
   * Get lock screen settings by userId (with caching)
   */
  async getById(userId: number): Promise<DBLockScreen | undefined> {
    const lockScreen = await this.db
      .select()
      .from(tables.userLockScreen)
      .where(eq(tables.userLockScreen.userId, userId))
      .get();

    return lockScreen;
  }

  /**
   * Get all lock screen settings
   */
  async getList(): Promise<DBLockScreen[]> {
    const lockScreens = await this.db.select().from(tables.userLockScreen).all();

    return lockScreens;
  }

  /**
   * Create new lock screen settings
   */
  async create(data: UserLockScreenCreateInput) {
    const result = await this.db.insert(tables.userLockScreen).values(data).returning().get();

    return result;
  }

  /**
   * Update lock screen settings
   */
  async update(data: UserLockScreenUpdateInput) {
    const result = await this.db
      .update(tables.userLockScreen)
      .set(data)
      .where(eq(tables.userLockScreen.userId, data.userId))
      .returning()
      .get();

    return result;
  }

  /**
   * Delete lock screen settings for a user
   */
  async delete(userId: number): Promise<void> {
    await this.db.delete(tables.userLockScreen).where(eq(tables.userLockScreen.userId, userId));
  }

  /**
   * Delete lock screen settings for multiple users
   */
  async bulkDelete(userIds: number[]): Promise<void> {
    if (userIds.length === 0) return;

    await this.db
      .delete(tables.userLockScreen)
      .where(inArray(tables.userLockScreen.userId, userIds));
  }
}

export default UserLockScreenService.getInstance();
